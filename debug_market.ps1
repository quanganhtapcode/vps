#!/usr/bin/env pwsh
# Debug market page issue

$API_BASE = "https://api.quanganh.org/v1/valuation"

Write-Host "="*80 -ForegroundColor Cyan
Write-Host "🔍 DEBUGGING MARKET PAGE ISSUE" -ForegroundColor Cyan
Write-Host "="*80 -ForegroundColor Cyan

# Test all market endpoints that the page uses
$endpoints = @(
    @{url="/market/indices"; name="Indices"},
    @{url="/market/news?page=1&size=10"; name="News"},
    @{url="/market/top-movers?direction=UP"; name="Top Gainers"},
    @{url="/market/top-movers?direction=DOWN"; name="Top Losers"},
    @{url="/market/foreign-flow?type=buy"; name="Foreign Buys"},
    @{url="/market/foreign-flow?type=sell"; name="Foreign Sells"},
    @{url="/market/gold"; name="Gold Prices"},
    @{url="/market/pe-chart"; name="P/E Chart"}
)

foreach ($endpoint in $endpoints) {
    Write-Host "`n📊 Testing: $($endpoint.name)" -ForegroundColor Yellow
    Write-Host "   URL: $API_BASE$($endpoint.url)"
    
    try {
        $response = Invoke-WebRequest -Uri "$API_BASE$($endpoint.url)" -Method Get -UseBasicParsing
        $statusCode = $response.StatusCode
        $contentLength = $response.Content.Length
        
        Write-Host "   ✅ Status: $statusCode" -ForegroundColor Green
        Write-Host "   📦 Size: $contentLength bytes"
        
        # Parse JSON and show sample
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.Data) {
            Write-Host "   📝 Data.Count: $($data.Data.Count)"
        } elseif ($data -is [array]) {
            Write-Host "   📝 Array length: $($data.Count)"
        } elseif ($data.isSuccess -ne $null) {
            Write-Host "   📝 isSuccess: $($data.isSuccess)"
        } else {
            Write-Host "   📝 Type: $($data.GetType().Name)"
        }
        
    } catch {
        Write-Host "   ❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)"
    }
}

# Test index chart endpoint (used in market page)
Write-Host "`n📈 Testing Index Chart (VN-Index)" -ForegroundColor Yellow
try {
    $chartUrl = "$API_BASE/market/realtime?center=1&type=1day"
    $response = Invoke-WebRequest -Uri $chartUrl -Method Get -UseBasicParsing
    Write-Host "   ✅ Chart data: $($response.StatusCode)" -ForegroundColor Green
    
    $chart = $response.Content | ConvertFrom-Json
    if ($chart.Data) {
        Write-Host "   📝 Chart points: $($chart.Data.Count)"
    }
} catch {
    Write-Host "   ❌ Chart failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Check CORS headers
Write-Host "`n🔐 Checking CORS headers..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/market/indices" -Method Options -UseBasicParsing
    $corsHeaders = $response.Headers | Where-Object { $_.Key -like "*Access-Control*" }
    
    if ($corsHeaders) {
        Write-Host "   ✅ CORS headers present:" -ForegroundColor Green
        foreach ($header in $corsHeaders) {
            Write-Host "      $($header.Key): $($header.Value)"
        }
    } else {
        Write-Host "   ⚠️  No CORS headers found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  OPTIONS request failed (may be normal)" -ForegroundColor Yellow
}

# Check backend health
Write-Host "`n💚 Backend Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_BASE/health" -Method Get
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Database: $($health.database)"
    Write-Host "   Uptime: $($health.uptime)"
} catch {
    Write-Host "   ❌ Health check failed" -ForegroundColor Red
}

# Summary
Write-Host "`n" + "="*80 -ForegroundColor Cyan
Write-Host "📋 SUMMARY" -ForegroundColor Cyan
Write-Host "="*80 -ForegroundColor Cyan

Write-Host "`nIf all endpoints return 200:"
Write-Host "  → Issue is likely in frontend (Next.js)"
Write-Host "  → Check browser console for errors"
Write-Host "  → Check Network tab in DevTools"
Write-Host "  → Try: npm run dev (locally)"

Write-Host "`nIf endpoints return 500/404:"
Write-Host "  → Backend issue"
Write-Host "  → Check PM2 logs: ssh root@203.55.176.10 'pm2 logs valuation-api'"
Write-Host "  → Restart: ssh root@203.55.176.10 'pm2 restart valuation-api'"

Write-Host "`nIf CORS errors:"
Write-Host "  -> Check backend CORS configuration"
Write-Host "  -> May need to add frontend domain to allowed origins"

Write-Host "`n🔗 Quick Links:"
Write-Host "  Frontend: https://quanganh.org/market"
Write-Host "  API: $API_BASE"
Write-Host "  Health: $API_BASE/health"
