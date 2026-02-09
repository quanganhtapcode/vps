# Deployment Guide

Hệ thống hoạt động theo mô hình Hybrid:
*   **Frontend:** Next.js deployed on **Vercel** (Automatic CI/CD).
*   **Backend:** Python/Flask deployed on **VPS** (Manual/Scripted Sync).

---

## 1. Frontend Deployment (Vercel)

Frontend (`frontend-next/`) được kết nối trực tiếp với GitHub Repository.
Mỗi khi có commit mới vào nhánh `main`, Vercel sẽ tự động:
1.  Kéo code về.
2.  Chạy `npm install` & `npm run build`.
3.  Deploy lên CDN toàn cầu.

**Cấu hình Vercel:**
*   **Framework Preset:** Next.js
*   **Root Directory:** `frontend-next`
*   **Environment Variables:**
    *   `NEXT_PUBLIC_API_URL`: `https://api.quanganh.org` (Trỏ về VPS Backend)

---

## 2. Backend Deployment (VPS)

Backend chạy trên VPS (Ubuntu/CentOS) với Gunicorn + Nginx.

### Cấu trúc trên VPS:
```
/var/www/valuation/
├── server.py              # Main App
├── fetch_financials_vps.py # Data fetcher
├── stocks.db              # Database
└── venv/                  # Python Virtual Env
```

### Quy trình cập nhật Backend:

**Cách 1: Dùng automation script (Khuyên dùng)**
Từ máy local (Windows), chạy:
```powershell
.\automation\deploy.ps1
```
Script này sẽ dùng `scp` để đẩy các file python mới nhất lên VPS.

**Cách 2: Thủ công**
1.  SSH vào VPS:
    ```bash
    ssh root@<VPS_IP>
    ```
2.  Pull code (nếu có dùng git trên VPS) hoặc Upload file thủ công.
3.  Restart Service:
    ```bash
    systemctl restart valuation-backend
    ```

### Nginx Configuration (Reverse Proxy)
Nginx listens on port 80/443 và forward request tới Gunicorn (Port 5000):

```nginx
server {
    server_name api.quanganh.org;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 3. Environment Variables

**Local (.env):**
```
VNSTOCK_API_KEY=your_key_here (Optional)
```

**VPS (/etc/environment hoặc .env):**
```
VNSTOCK_API_KEY=...
FLASK_APP=server.py
FLASK_ENV=production
```
