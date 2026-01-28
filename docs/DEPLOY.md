# 🚀 Hướng dẫn Deploy

## Tổng quan

| Môi trường | URL |
|------------|-----|
| **Production** | https://valuation.quanganh.org |
| **API** | https://api.quanganh.org |
| **VPS** | `root@203.55.176.10` (Public) hoặc `10.66.66.1` (VPN) |

---

## 1. Deploy Code (Hàng ngày)

Sử dụng script tự động:

```powershell
# Từ thư mục project
cd C:\Users\PC\Downloads\Valuation

# Deploy với commit message
.\automation\deploy.ps1 -CommitMessage "Mô tả thay đổi"
```

**Script sẽ tự động:**
1. ✅ Commit & push code lên GitHub
2. ✅ Sync `backend/`, `frontend/`, `automation/` lên VPS
3. ✅ Sync `sector_peers.json`, `package.json`
4. ✅ Restart gunicorn-ec2 service

---

## 2. SSH vào VPS (Khi cần debug)

```powershell
ssh -i "$env:USERPROFILE\Downloads\key.pem" root@10.66.66.1
```

**Các lệnh hữu ích:**
```bash
# Xem logs
journalctl -u gunicorn-ec2 -f

# Restart service
systemctl restart gunicorn-ec2

# Check status
systemctl status gunicorn-ec2
```

---

## 3. Cấu trúc trên VPS

```
/var/www/valuation/
├── backend/
│   ├── server.py       # API server
│   ├── models.py       # Valuation models
│   └── r2_client.py    # R2 storage client
├── frontend/
│   ├── index.html      # Market Overview page
│   ├── valuation.html  # Valuation page
│   ├── css/            # Stylesheets
│   │   ├── overview.css
│   │   └── ticker-autocomplete.css
│   ├── js/             # JavaScript
│   │   └── overview.js
│   └── ticker_data.json
├── automation/
├── stocks/             # Stock JSON data (700+ files)
├── .venv/              # Virtual environment
├── .env                # R2 credentials
└── sector_peers.json
```

---

## 4. Cập nhật Dependencies trên VPS

```bash
cd /var/www/valuation
source .venv/bin/activate
pip install -r requirements.txt
systemctl restart gunicorn-ec2
```

---

## 5. Troubleshooting

### Lỗi 502 Bad Gateway
```bash
# Xem log lỗi
journalctl -u gunicorn-ec2 --since "10 min ago"

# Restart service
systemctl restart gunicorn-ec2
```

### Lỗi Permission denied (SSH)
- Kiểm tra file `key.pem` tại `~/Downloads/key.pem`
- Đảm bảo quyền: `chmod 400 key.pem` (Linux/Mac)

### Service không start
```bash
# Kiểm tra syntax Python
cd /var/www/valuation
source .venv/bin/activate
python -c "from backend.server import app; print('OK')"
```

### JavaScript không load
- Clear cache browser: `Ctrl+Shift+R`
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
