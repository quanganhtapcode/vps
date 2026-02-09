# Troubleshooting Guide

Common issues and solutions for Vietnam Stock Valuation Platform.

---

## Table of Contents

- [Backend Issues](#backend-issues)
- [Database Issues](#database-issues)
- [API Issues](#api-issues)
- [Performance Issues](#performance-issues)
- [Deployment Issues](#deployment-issues)
- [Data Fetching Issues](#data-fetching-issues)
- [Frontend Issues](#frontend-issues)

---

## Backend Issues

### Service Won't Start

**Symptoms:**
- `sudo systemctl start gunicorn` fails
- Server not responding on port 8000

**Diagnosis:**
```bash
# Check service status
sudo systemctl status gunicorn

# View detailed logs
sudo journalctl -u gunicorn -n 50 --no-pager

# Check if port is already in use
sudo lsof -i :8000
```

**Solutions:**

1. **Port Already in Use**
   ```bash
   # Find process using port 8000
   sudo lsof -i :8000
   
   # Kill the process
   sudo kill -9 <PID>
   
   # Or kill all gunicorn processes
   sudo pkill -9 gunicorn
   
   # Restart service
   sudo systemctl start gunicorn
   ```

2. **Python Environment Issues**
   ```bash
   # Verify virtual environment
   source /var/www/valuation/.venv/bin/activate
   which python3
   which gunicorn
   
   # Reinstall dependencies
   pip install -r requirements.txt
   
   # Test manually
   cd /var/www/valuation
   gunicorn backend.server:app --bind 0.0.0.0:8000
   ```

3. **Permission Issues**
   ```bash
   # Fix ownership
   sudo chown -R root:www-data /var/www/valuation
   sudo chmod -R 755 /var/www/valuation
   
   # Fix log permissions
   sudo touch /var/log/gunicorn-error.log
   sudo touch /var/log/gunicorn-access.log
   sudo chown root:www-data /var/log/gunicorn-*.log
   sudo chmod 664 /var/log/gunicorn-*.log
   ```

4. **Configuration Errors**
   ```bash
   # Validate systemd service file
   sudo systemctl daemon-reload
   sudo systemctl status gunicorn
   
   # Check syntax errors in Python code
   python -m py_compile backend/server.py
   ```

---

### Database Connection Errors

**Symptoms:**
- Error: `unable to open database file`
- 500 error when querying stock data

**Diagnosis:**
```bash
# Check if database exists
ls -lh /var/www/valuation/stocks.db

# Check permissions
ls -l /var/www/valuation/stocks.db

# Test database integrity
sqlite3 /var/www/valuation/stocks.db "PRAGMA integrity_check;"
```

**Solutions:**

1. **Database File Missing**
   ```bash
   # Restore from backup
   scp backup/stocks.db root@203.55.176.10:/var/www/valuation/
   
   # Or fetch fresh data
   python scripts/fetch_financials_vps.py --symbol VCB
   ```

2. **Permission Issues**
   ```bash
   # Fix permissions
   sudo chown root:www-data /var/www/valuation/stocks.db
   sudo chmod 640 /var/www/valuation/stocks.db
   
   # Ensure directory is writable (for WAL files)
   sudo chmod 775 /var/www/valuation
   ```

3. **Database Locked**
   ```bash
   # Find processes locking database
   sudo lsof | grep stocks.db
   
   # Kill locking processes
   sudo kill -9 <PID>
   
   # Remove lock files
   rm -f /var/www/valuation/stocks.db-shm
   rm -f /var/www/valuation/stocks.db-wal
   
   # Restart service
   sudo systemctl restart gunicorn
   ```

---

### Import Errors

**Symptoms:**
- `ModuleNotFoundError: No module named 'flask'`
- `ImportError: cannot import name 'xxx'`

**Diagnosis:**
```bash
# Check if virtual environment is activated
which python3
which pip

# List installed packages
pip list
```

**Solutions:**

1. **Dependencies Not Installed**
   ```bash
   # Activate virtual environment
   source /var/www/valuation/.venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Verify installation
   pip show flask
   pip show vnstock
   ```

2. **Wrong Python Environment**
   ```bash
   # Check systemd service uses correct Python
   sudo nano /etc/systemd/system/gunicorn.service
   
   # Ensure this line exists:
   Environment="PATH=/var/www/valuation/.venv/bin"
   
   # Reload and restart
   sudo systemctl daemon-reload
   sudo systemctl restart gunicorn
   ```

---

## Database Issues

### Database Corruption

**Symptoms:**
- `database disk image is malformed`
- `PRAGMA integrity_check` returns errors

**Diagnosis:**
```bash
# Check integrity
sqlite3 stocks.db "PRAGMA integrity_check;"

# Check size
ls -lh stocks.db
```

**Solutions:**

1. **Restore from Backup**
   ```bash
   # Stop service
   sudo systemctl stop gunicorn
   
   # Backup corrupted database
   mv stocks.db stocks_corrupted_$(date +%Y%m%d).db
   
   # Restore from backup
   cp /path/to/backup/stocks.db stocks.db
   
   # Fix permissions
   sudo chown root:www-data stocks.db
   sudo chmod 640 stocks.db
   
   # Start service
   sudo systemctl start gunicorn
   ```

2. **Export and Reimport**
   ```bash
   # Export all data
   sqlite3 stocks.db ".dump" > stocks_dump.sql
   
   # Create new database
   mv stocks.db stocks_old.db
   sqlite3 stocks.db < stocks_dump.sql
   
   # Optimize
   python scripts/optimize_database.py
   ```

---

### Database Performance Issues

**Symptoms:**
- Slow query response times
- High CPU when querying database

**Diagnosis:**
```bash
# Test query performance
python scripts/optimize_database.py --show-indexes

# Check database size
sqlite3 stocks.db "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();"

# Analyze query plan
sqlite3 stocks.db "EXPLAIN QUERY PLAN SELECT * FROM stock_overview WHERE symbol='VCB';"
```

**Solutions:**

1. **Missing Indexes**
   ```bash
   # Run optimization script
   python scripts/optimize_database.py
   
   # Verify indexes created
   sqlite3 stocks.db ".indexes"
   ```

2. **Database Bloat**
   ```bash
   # Run VACUUM to reclaim space
   sqlite3 stocks.db "VACUUM;"
   
   # Run ANALYZE to update stats
   sqlite3 stocks.db "ANALYZE;"
   
   # Restart service
   sudo systemctl restart gunicorn
   ```

3. **Too Many Connections**
   ```bash
   # Reduce Gunicorn workers
   sudo nano /etc/systemd/system/gunicorn.service
   # Change --workers 4 to --workers 2
   
   sudo systemctl daemon-reload
   sudo systemctl restart gunicorn
   ```

---

## API Issues

### 404 Not Found

**Symptoms:**
- All API endpoints return 404
- Nginx shows "502 Bad Gateway"

**Diagnosis:**
```bash
# Test backend directly
curl http://localhost:8000/health

# Check Gunicorn status
sudo systemctl status gunicorn

# Check Nginx config
sudo nginx -t
```

**Solutions:**

1. **Backend Not Running**
   ```bash
   # Start Gunicorn
   sudo systemctl start gunicorn
   
   # Verify it's listening
   sudo netstat -tulpn | grep :8000
   ```

2. **Nginx Misconfiguration**
   ```bash
   # Check Nginx config
   sudo nginx -t
   
   # Fix common issue: wrong proxy_pass
   sudo nano /etc/nginx/sites-available/valuation-api
   # Ensure: proxy_pass http://127.0.0.1:8000;
   
   # Restart Nginx
   sudo systemctl restart nginx
   ```

3. **Firewall Blocking**
   ```bash
   # Check firewall rules
   sudo ufw status
   
   # Allow port 8000 (if needed)
   sudo ufw allow 8000/tcp
   
   # But typically only 80/443 needed (Nginx proxies to 8000)
   ```

---

### CORS Errors

**Symptoms:**
- Frontend can't fetch from API
- Browser console: "CORS policy blocked"

**Diagnosis:**
```bash
# Test with curl (no CORS)
curl -I http://api.quanganh.org/v1/valuation/stock/VCB

# Check CORS headers
curl -H "Origin: http://example.com" \
     -H "Access-Control-Request-Method: GET" \
     -I http://api.quanganh.org/v1/valuation/stock/VCB
```

**Solutions:**

1. **Update Flask CORS**
   ```python
   # In backend/server.py
   from flask_cors import CORS
   
   CORS(app, resources={r"/*": {"origins": "*"}})
   ```

2. **Update Nginx Config**
   ```nginx
   # In /etc/nginx/sites-available/valuation-api
   location / {
       add_header Access-Control-Allow-Origin * always;
       add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
       add_header Access-Control-Allow-Headers "Content-Type" always;
       
       # Handle preflight
       if ($request_method = 'OPTIONS') {
           return 204;
       }
       
       proxy_pass http://127.0.0.1:8000;
   }
   ```

---

### Rate Limiting Issues

**Symptoms:**
- `429 Too Many Requests`
- Data fetching stops mid-process

**Diagnosis:**
```bash
# Check logs for rate limit errors
grep "rate limit" /var/log/gunicorn-error.log

# Test API key status
python -c "from vnstock import Vnstock; print(Vnstock().quote.info('VCB'))"
```

**Solutions:**

1. **Check API Key Rotation**
   ```bash
   # Verify both keys are loaded
   grep "VNSTOCK_API_KEY" .env
   
   # Test script
   python scripts/fetch_financials_vps.py --symbol VCB
   ```

2. **Wait and Retry**
   ```bash
   # Rate limit: 60 req/min per key (120 total with 2 keys)
   # Wait 60 seconds and retry
   sleep 60
   python scripts/fetch_financials_vps.py --mode resume
   ```

3. **Add More Keys**
   ```bash
   # Edit .env and add VNSTOCK_API_KEY_3
   nano .env
   
   # Update fetch script to use 3 keys
   # Reload service
   sudo systemctl restart gunicorn
   ```

---

## Performance Issues

### Slow API Response

**Symptoms:**
- API calls take > 500ms
- Low cache hit rate

**Diagnosis:**
```bash
# Test performance
python scripts/test_api_performance.py

# Check cache stats
curl http://localhost:8000/health

# Monitor resources
htop
```

**Solutions:**

1. **Enable/Verify Caching**
   ```python
   # In backend/routes/*.py
   from backend.cache_utils import cached
   
   @cached(ttl=300)  # 5 minutes
   def get_expensive_data():
       return query_database()
   ```

2. **Optimize Database**
   ```bash
   # Run optimization
   python scripts/optimize_database.py
   
   # Verify indexes
   sqlite3 stocks.db ".schema stock_overview" | grep INDEX
   ```

3. **Reduce Worker Load**
   ```bash
   # If high CPU, reduce workers
   sudo nano /etc/systemd/system/gunicorn.service
   # --workers 2 (instead of 4)
   
   sudo systemctl daemon-reload
   sudo systemctl restart gunicorn
   ```

4. **Enable Gzip Compression**
   ```bash
   # Install flask-compress
   pip install flask-compress
   
   # Add to backend/server.py:
   from flask_compress import Compress
   Compress(app)
   
   # Restart
   sudo systemctl restart gunicorn
   ```

---

### High Memory Usage

**Symptoms:**
- Server running out of memory
- OOMKiller kills Gunicorn

**Diagnosis:**
```bash
# Check memory usage
free -h

# Check process memory
ps aux | grep gunicorn

# Check system logs
sudo dmesg | grep -i "out of memory"
```

**Solutions:**

1. **Reduce Workers**
   ```bash
   # Edit systemd service
   sudo nano /etc/systemd/system/gunicorn.service
   # --workers 2 (each worker ~150MB)
   
   sudo systemctl daemon-reload
   sudo systemctl restart gunicorn
   ```

2. **Clear Cache Periodically**
   ```bash
   # Restart service daily to clear cache
   sudo crontab -e
   
   # Add line (restart at 3 AM)
   0 3 * * * /usr/bin/systemctl restart gunicorn
   ```

3. **Add Swap**
   ```bash
   # Create 2GB swap file
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   
   # Make permanent
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

## Deployment Issues

### Git Pull Fails

**Symptoms:**
- `git pull` shows merge conflicts
- "Your local changes would be overwritten"

**Solutions:**

1. **Stash Local Changes**
   ```bash
   # Save local changes
   git stash
   
   # Pull updates
   git pull origin main
   
   # Reapply local changes
   git stash pop
   
   # Resolve conflicts if any
   git status
   ```

2. **Hard Reset (Caution: Loses local changes)**
   ```bash
   # Backup current state
   cp -r /var/www/valuation /var/www/valuation_backup
   
   # Reset to remote
   git fetch origin
   git reset --hard origin/main
   
   # Reinstall dependencies
   pip install -r requirements.txt
   sudo systemctl restart gunicorn
   ```

---

### SSL Certificate Issues

**Symptoms:**
- Browser shows "Not Secure"
- `ERR_CERT_DATE_INVALID`

**Diagnosis:**
```bash
# Check certificate expiry
sudo certbot certificates
```

**Solutions:**

1. **Renew Certificate**
   ```bash
   # Manual renewal
   sudo certbot renew
   
   # Test renewal
   sudo certbot renew --dry-run
   
   # Reload Nginx
   sudo systemctl reload nginx
   ```

2. **Fix Auto-Renewal**
   ```bash
# Check cron job
   sudo systemctl list-timers | grep certbot
   
   # Enable auto-renewal
   sudo systemctl enable certbot.timer
   sudo systemctl start certbot.timer
   ```

---

## Data Fetching Issues

### VCI API SSL Errors

**Symptoms:**
- `SSL: CERTIFICATE_VERIFY_FAILED`
- Data fetch fails with SSL error

**Solutions:**

1. **Disable SSL Warnings**
   ```python
   # Already implemented in fetch_financials_vps.py
   import urllib3
   urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
   ```

2. **Update vnstock**
   ```bash
   pip install --upgrade vnstock
   ```

3. **Use Alternative Provider**
   ```python
   # In fetch script, use CafeF instead of VCI
   from vnstock import Vnstock
   stock = Vnstock(provider='cafef')
   ```

---

### Data Fetch Hangs

**Symptoms:**
- Fetch script runs but doesn't progress
- No output for long time

**Solutions:**

1. **Check API Key**
   ```bash
   # Verify API key is valid
   python -c "from vnstock import Vnstock; print(Vnstock().quote.info('VCB'))"
   ```

2. **Resume from Last Position**
   ```bash
   # Use resume mode
   python scripts/fetch_financials_vps.py --mode resume
   ```

3. **Fetch Single Stock**
   ```bash
   # Test with one stock
   python scripts/fetch_financials_vps.py --symbol VCB
   
   # If successful, continue with full fetch
   python scripts/fetch_financials_vps.py
   ```

---

### Missing Data

**Symptoms:**
- Stock shows in list but no financial data
- PE ratio shows as NULL

**Diagnosis:**
```bash
# Check if data exists
sqlite3 stocks.db "SELECT * FROM stock_overview WHERE symbol='VCB';"

# Check financial statements
sqlite3 stocks.db "SELECT COUNT(*) FROM financial_statements WHERE symbol='VCB';"
```

**Solutions:**

1. **Fetch Missing Data**
   ```bash
   # Fetch specific stock
   python scripts/fetch_financials_vps.py --symbol VCB
   ```

2. **Rebuild Overview**
   ```bash
   # Delete and refetch
   sqlite3 stocks.db "DELETE FROM stock_overview WHERE symbol='VCB';"
   python scripts/fetch_financials_vps.py --symbol VCB
   ```

---

## Frontend Issues

### API Connection Failed

**Symptoms:**
- Frontend shows "Failed to fetch"
- Network errors in browser console

**Diagnosis:**
```bash
# Test API from browser's perspective
curl http://api.quanganh.org/health

# Check environment variable
cat frontend-next/.env.local | grep API_URL
```

**Solutions:**

1. **Update API URL**
   ```bash
   # Edit .env.local
   nano frontend-next/.env.local
   
   # Set correct URL
   NEXT_PUBLIC_API_URL=http://api.quanganh.org
   
   # Rebuild
   cd frontend-next
   npm run build
   ```

2. **Clear Browser Cache**
   - Open DevTools (F12)
   - Right-click Refresh button
   - Select "Empty Cache and Hard Reload"

---

### Build Failures

**Symptoms:**
- `npm run build` fails
- TypeScript errors

**Solutions:**

1. **Clean Install**
   ```bash
   cd frontend-next
   rm -rf node_modules .next
   npm install
   npm run build
   ```

2. **Fix TypeScript Errors**
   ```bash
   # Check errors
   npm run build 2>&1 | tee build-errors.log
   
   # Fix types in src/lib/types.ts
   ```

---

## Getting Help

If issue persists:

1. **Collect Logs**
   ```bash
   # Backend logs
   sudo journalctl -u gunicorn -n 100 > gunicorn.log
   
   # Nginx logs
   sudo tail -100 /var/log/nginx/valuation-error.log > nginx.log
   
   # System info
   uname -a > system.log
   free -h >> system.log
   df -h >> system.log
   ```

2. **Test API**
   ```bash
   python scripts/test_api_performance.py > api-test.log
   ```

3. **Database Stats**
   ```bash
   sqlite3 stocks.db "SELECT COUNT(*) FROM stock_overview;" > db-stats.log
   sqlite3 stocks.db ".dbinfo" >> db-stats.log
   ```

4. **Contact**
   - Create GitHub issue with logs attached
   - Include steps to reproduce

---

## Prevention Tips

### Regular Maintenance

```bash
# Weekly tasks (automate with cron)
# 1. Backup database
./scripts/backup_to_d1.sh

# 2. Update data
python scripts/fetch_financials_vps.py --mode update

# 3. Optimize database
python scripts/optimize_database.py

# 4. Check logs for errors
sudo journalctl -u gunicorn --since "1 week ago" | grep -i error

# 5. Test API
python scripts/test_api_performance.py
```

### Monitoring

```bash
# Set up monitoring script
cat > /var/www/valuation/monitor.sh << 'EOF'
#!/bin/bash
# Check if service is running
if ! systemctl is-active --quiet gunicorn; then
    echo "Gunicorn is down! Restarting..."
    systemctl restart gunicorn
fi

# Check API health
if ! curl -s http://localhost:8000/health > /dev/null; then
    echo "API health check failed!"
fi
EOF

chmod +x monitor.sh

# Run every 5 minutes
crontab -e
# Add: */5 * * * * /var/www/valuation/monitor.sh
```

---

© 2025 Quang Anh. All rights reserved.
