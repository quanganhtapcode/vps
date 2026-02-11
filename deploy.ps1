#!/usr/bin/env pwsh
# Deploy updated backend to VPS

param(
    [switch]$SkipDB,
    [switch]$SkipBackend,
    [switch]$TestOnly
)

$VPS_HOST = "203.55.176.10"
$SSH_KEY = "$HOME/Desktop/key.pem"
$VPS_PATH = "/var/www/valuation"

Write-Host "="*80 -ForegroundColor Cyan
Write-Host "🚀 DEPLOYING TO VPS: $VPS_HOST" -ForegroundColor Cyan
Write-Host "="*80 -ForegroundColor Cyan

# Test SSH connection
Write-Host "`n📡 Testing SSH connection..." -ForegroundColor Yellow
$sshTest = ssh -i $SSH_KEY root@$VPS_HOST "echo 'SSH OK'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ SSH connection failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ SSH connection OK" -ForegroundColor Green

if ($TestOnly) {
    Write-Host "`n🔍 Testing API endpoints..." -ForegroundColor Yellow
    
    # Test backend health
    Write-Host "`n1. Backend health:"
    curl -s "https://api.quanganh.org/v1/valuation/health" | ConvertFrom-Json | Format-List
    
    # Test market indices
    Write-Host "`n2. Market indices:"
    $indices = curl -s "https://api.quanganh.org/v1/valuation/market/indices" | ConvertFrom-Json
    Write-Host "   Indices count: $($indices.Data.Count)"
    
    # Test stock with ratios
    Write-Host "`n3. ACB stock data (checking NIM):"
    $acb = curl -s "https://api.quanganh.org/v1/valuation/stock/ACB" | ConvertFrom-Json
    if ($acb.ratios -and $acb.ratios.Count -gt 0) {
        $latestRatio = $acb.ratios[0]
        Write-Host "   Latest ratio: $($latestRatio.year) Q$($latestRatio.quarter)"
        Write-Host "   ROE: $($latestRatio.roe)"
        Write-Host "   NIM: $($latestRatio.nim)"
    }
    
    # Test market news
    Write-Host "`n4. Market news:"
    $news = curl -s "https://api.quanganh.org/v1/valuation/market/news?page=1&size=5" | ConvertFrom-Json
    Write-Host "   News count: $($news.Count)"
    
    exit 0
}

# 1. Upload Backend Code
if (-not $SkipBackend) {
    Write-Host "`n📦 Uploading backend code..." -ForegroundColor Yellow
    
    Write-Host "  → sqlite_db.py"
    scp -i $SSH_KEY backend/data_sources/sqlite_db.py root@${VPS_HOST}:${VPS_PATH}/backend/data_sources/
    
    Write-Host "  → fetch_financials_v3.py"
    scp -i $SSH_KEY fetch_financials_v3.py root@${VPS_HOST}:${VPS_PATH}/
    
    Write-Host "✅ Backend code uploaded" -ForegroundColor Green
}

# 2. Upload Database
if (-not $SkipDB) {
    Write-Host "`n💾 Uploading migrated database..." -ForegroundColor Yellow
    Write-Host "  → stocks_production.db (610MB, ~15 seconds)"
    
    $uploadStart = Get-Date
    scp -i $SSH_KEY stocks_production.db root@${VPS_HOST}:${VPS_PATH}/stocks_new.db
    $uploadEnd = Get-Date
    $uploadTime = ($uploadEnd - $uploadStart).TotalSeconds
    
    Write-Host "✅ Database uploaded in ${uploadTime}s" -ForegroundColor Green
    
    # Backup and replace database
    Write-Host "`n🔄 Backing up old database and replacing..." -ForegroundColor Yellow
    
    ssh -i $SSH_KEY root@$VPS_HOST @"
cd $VPS_PATH
echo '→ Creating backup...'
cp stocks.db stocks_backup_`$(date +%Y%m%d_%H%M%S).db
echo '→ Replacing database...'
mv stocks_new.db stocks.db
echo '✅ Database replaced'
ls -lh stocks*.db | tail -3
"@
}

# 3. Restart Backend Service
Write-Host "`n🔄 Restarting backend service..." -ForegroundColor Yellow

ssh -i $SSH_KEY root@$VPS_HOST @"
cd $VPS_PATH
echo '→ Checking PM2 status...'
pm2 list | grep valuation
echo ''
echo '→ Restarting service...'
pm2 restart valuation-api
sleep 2
echo ''
echo '→ Checking logs...'
pm2 logs valuation-api --lines 10 --nostream
"@

Write-Host "✅ Backend restarted" -ForegroundColor Green

# 4. Verify Deployment
Write-Host "`n✅ Running post-deployment tests..." -ForegroundColor Yellow

Start-Sleep -Seconds 3

Write-Host "`n1. Backend health check:"
try {
    $health = Invoke-RestMethod -Uri "https://api.quanganh.org/v1/valuation/health" -Method Get
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Database: $($health.database)"
} catch {
    Write-Host "   ❌ Health check failed: $_" -ForegroundColor Red
}

Write-Host "`n2. Test stock ratios (ACB):"
try {
    $acb = Invoke-RestMethod -Uri "https://api.quanganh.org/v1/valuation/stock/ACB" -Method Get
    if ($acb.ratios -and $acb.ratios.Count -gt 0) {
        $latest = $acb.ratios[0]
        Write-Host "   Latest: $($latest.year) Q$($latest.quarter)" -ForegroundColor Green
        Write-Host "   ROE: $($latest.roe * 100)%" -ForegroundColor Green
        Write-Host "   NIM: $(if($latest.nim) { ($latest.nim * 100).ToString('0.00') + '%' } else { 'N/A' })" -ForegroundColor $(if($latest.nim) { 'Green' } else { 'Yellow' })
    }
} catch {
    Write-Host "   ❌ Stock test failed: $_" -ForegroundColor Red
}

Write-Host "`n3. Test market endpoints:"
try {
    $indices = Invoke-RestMethod -Uri "https://api.quanganh.org/v1/valuation/market/indices" -Method Get
    Write-Host "   Indices: $($indices.Data.Count) available" -ForegroundColor Green
    
    $news = Invoke-RestMethod -Uri "https://api.quanganh.org/v1/valuation/market/news?page=1&size=5" -Method Get
    Write-Host "   News: $($news.Count) articles" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Market test failed: $_" -ForegroundColor Red
}

Write-Host "`n" + "="*80 -ForegroundColor Cyan
Write-Host "✅ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "="*80 -ForegroundColor Cyan

Write-Host "`n📝 Next steps:"
Write-Host "  1. Check frontend: https://quanganh.org/market"
Write-Host "  2. Test stock page: https://quanganh.org/stock/ACB"
Write-Host "  3. Monitor logs: ssh -i $SSH_KEY root@$VPS_HOST 'pm2 logs valuation-api'"
