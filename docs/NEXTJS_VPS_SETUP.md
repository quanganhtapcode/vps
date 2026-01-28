# 🌐 Next.js VPS Setup Guide

Since we migrated from static HTML to Next.js, the deployment process on the VPS has changed slightly. We now need to run a Node.js server.

## 1. Login to VPS
```bash
ssh -i ~/Desktop/key.pem root@203.55.176.10
```

## 2. Install Node.js (Version 18+)
Check if node is installed:
```bash
node -v
```
If not (or if version < 18), install via nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

## 3. Install PM2 (Process Manager)
To keep the website running 24/7:
```bash
npm install -g pm2
```

## 4. Initial Setup
The deployment script syncs code to `/var/www/valuation/frontend`. We need to build it once.

```bash
cd /var/www/valuation/frontend

# Install dependencies
npm install

# Build the project
npm run build

# Start the server (Port 3000 by default, or 3002 if 3000 is taken)
# We use port 3002 as 3000 is used by Invoice App
pm2 start npm --name "valuation-frontend" -- start -- -p 3002
```

## 5. Update NGINX
We need to point `valuation.quanganh.org` to the Next.js app (Port 3002), instead of the static folder.

Edit config:
```bash
nano /etc/nginx/sites-available/valuation.quanganh.org
```

Change the `location /` block:
```nginx
server {
    listen 80;
    server_name valuation.quanganh.org;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API is handled by api.quanganh.org, but if you have a local proxy:
    location /api/ {
        proxy_pass http://localhost:8000;
    }
}
```

Restart NGINX:
```bash
nginx -t
systemctl restart nginx
```
