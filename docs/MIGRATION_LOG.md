# Migration & Server Setup Log
**Date:** January 2, 2026
**Server IP:** 203.55.176.10

This document outlines the recent changes made to the server configuration, file structure, and application deployment for `api.quanganh.org` (Valuation App Backend) and `invoice.quanganh.org` (Invoice App).

## 1. Directory Structure Restructuring
We have standardized the directory structure to follow Linux best practices (`/var/www`).

### **Old Structure (Deprecated)**
- `~/apps/ec2/` (Root user's home directory) - Contain Valuation App Backend.
- `~/backend/` (Root user's home directory) - Contain Invoice App Backend (temporarily).

### **New Structure (standardized)**
All web applications are now located in `/var/www/`.

| App Name | Domain | Path | Tech Stack |
| :--- | :--- | :--- | :--- |
| **Valuation Backend** | `api.quanganh.org` | `/var/www/api.quanganh.org` | Python (Flask) + Gunicorn |
| **Invoice App** | `invoice.quanganh.org` | `/var/www/invoice.quanganh.org` | Node.js + PM2 (Backend) <br> Nginx Static (Frontend) |
| **POS App** | `vps.quanganh.org` | *(Existing setup)* | Node.js |

> **Note:** The `/root/apps` directory has been removed to keep the root home directory clean.

## 2. Valuation Backend Migration (`api.quanganh.org`)

### **Actions Taken:**
1.  **Moved Source Code:** Moved code from `/root/apps/ec2` to `/var/www/api.quanganh.org`.
2.  **Virtual Environment:** Recreated Python virtual environment (`.venv`) at the new location to fix pathing issues.
3.  **Dependencies:** Updated `requirements.txt` to include missing dependencies:
    *   `python-dotenv` (for environment variables)
    *   `boto3` (for AWS/R2 cloud storage interaction)
4.  **Systemd Service:** Updated `gunicorn-ec2.service` to point to the new directory.

### **Service Configuration (`/etc/systemd/system/gunicorn-ec2.service`)**
```ini
[Unit]
Description=Gunicorn instance to serve EC2 Flask app
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/var/www/api.quanganh.org
Environment="PATH=/var/www/api.quanganh.org/.venv/bin"
Environment="PYTHONPATH=/var/www/api.quanganh.org"
ExecStart=/var/www/api.quanganh.org/.venv/bin/gunicorn --workers 4 --bind 0.0.0.0:8000 --error-logfile /var/log/gunicorn-error.log backend.server:app

[Install]
WantedBy=multi-user.target
```

## 3. Nginx Configuration & SSL
We have standardized the SSL and Nginx configuration for `api.quanganh.org`.

### **Changes:**
1.  **SSL Certificate:** Switched from `Certbot` (Let's Encrypt) to **Cloudflare Origin CA Certificate**.
    *   **Certificate Path:** `/etc/ssl/certs/quanganh_origin.pem`
    *   **Key Path:** `/etc/ssl/private/quanganh_origin.key`
    *   **Benefits:** Valid for 15 years, no need for 3-month renewal, optimized for Cloudflare proxy.
2.  **HTTP/2:** Enabled `http2 on;` for better performance.
3.  **CORS:** Maintained Access-Control Headers to allow requests from `https://valuation.quanganh.org`.

### **Nginx Config (`/etc/nginx/sites-available/api.quanganh.org`)**
```nginx
server {
    listen 80;
    server_name api.quanganh.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.quanganh.org;

    ssl_certificate /etc/ssl/certs/quanganh_origin.pem;
    ssl_certificate_key /etc/ssl/private/quanganh_origin.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS
        add_header Access-Control-Allow-Origin "https://valuation.quanganh.org" always;
    }
}
```

## 4. Current Process Management
- **Node.js Apps (Invoice API):** Managed by `PM2`.
- **Python Apps (Valuation API):** Managed by `Systemd` + `Gunicorn`.

## 5. Verification
- **Valuation API:** `curl -I https://api.quanganh.org/api/market/news?page=1&size=10` -> Returns `200 OK`.
- **Web Interface:** `https://valuation.quanganh.org` loads data correctly without CORS errors.
