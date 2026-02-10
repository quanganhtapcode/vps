# 📈 Vietnam Stock Valuation Platform

> Nền tảng phân tích và định giá cổ phiếu Việt Nam với dữ liệu tự động cập nhật

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

🌐 **Website:** [valuation.quanganh.org](https://valuation.quanganh.org)  
💻 **API:** [api.quanganh.org](https://api.quanganh.org)

---

## 🌟 Tính năng

- **1,500+ cổ phiếu** trên HOSE, HNX, UPCOM
- **Phân tích tài chính:** P/E, P/B, ROE, ROA, EPS, NIM (ngân hàng)
- **Tổng quan thị trường:** PE chart, VN-Index, HNX-Index, market cap
- **Dữ liệu lịch sử:** Quarterly & yearly financial statements
- **API nhanh:** ~30-50ms average, gzip compression, smart caching
- **Tự động cập nhật:** Systemd service chạy hàng ngày 18:00

---

## 🛠️ Tech Stack

### Backend
- **Framework:** Flask + Gunicorn (4 workers, port 8000)
- **Database:** SQLite 656MB - V3 Normalized Schema
- **Data Source:** vnstock 3.4.2 (VCI/TCBS provider)
- **Caching:** TTL cache (80%+ hit rate)

### Frontend
- **Framework:** Next.js 15.1 App Router
- **Language:** TypeScript
- **UI:** Tailwind CSS
- **API:** Fetch from backend via proxy routes

### Infrastructure
- **VPS:** Ubuntu 22.04 - 203.55.176.10
- **Web Server:** Nginx (reverse proxy + API gateway)
- **Automation:** systemd service + timer
- **Deployment:** SCP upload + Git push (Vercel auto-deploy frontend)

---

## 📁 Project Structure

```
vietnam-stock-valuation/
├── backend/                    # Flask API
│   ├── server.py              # Main app
│   ├── stock_provider.py      # Data service
│   ├── routes/               
│   │   ├── stock_routes.py    # /api/stock/*
│   │   └── market.py          # /api/market/*
│   └── data_sources/
│       ├── vci.py             # VCI data provider
│       └── sqlite_db.py       # Database layer
│
├── frontend-next/              # Next.js app
│   ├── src/app/
│   │   ├── page.tsx           # Homepage
│   │   ├── stock/[symbol]/   # Stock detail
│   │   ├── market/            # Market overview
│   │   └── api/[...path]/     # API proxy
│   └── src/components/
│       ├── StockDetail/       # Stock views
│       └── Table/             # Data tables
│
├── automation/                 # Automation scripts
│   ├── stock-fetch.service    # systemd service
│   ├── stock-fetch.timer      # Daily timer (18:00)
│   ├── sync_nim_to_overview.py # NIM sync
│   ├── deploy_database.ps1    # Deploy DB to VPS
│   └── setup_systemd.sh       # Install service/timer
│
├── fetch_stock_data.py         # Main fetch script (V3 schema)
├── stocks_production.db        # Local database backup
│
└── docs/
    ├── DATABASE_STRUCTURE.md   # Schema reference
    └── TROUBLESHOOTING.md      # Debug guide
```

---

## 🚀 Quick Start

### 1. Local Development

#### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Run Flask server
python backend/server.py
# API: http://localhost:8000
```

#### Frontend
```bash
cd frontend-next
npm install
npm run dev
# Website: http://localhost:3000
```

### 2. Fetch dữ liệu

```bash
# Fetch 1 cổ phiếu
python fetch_stock_data.py --symbols VCB --delay 1

# Fetch nhiều cổ phiếu
python fetch_stock_data.py --symbols VCB MBB ACB --delay 1

# Sync NIM cho ngân hàng
python automation/sync_nim_to_overview.py
```

---

## 📊 Database Schema (V3 Normalized)

### stock_overview (1,552 records)
**Bảng chính cho API** - Pre-computed data
- Valuation: pe, pb, ps, ev_ebitda
- Profitability: roe, roa, net_profit_margin, gross_margin
- Financials: revenue (TTM), net_income (TTM), total_assets
- Banking: nim (Net Interest Margin - ngân hàng only)

### stock_ratios_core (65,897 records)
13 chỉ số tài chính chính - Quarterly/Yearly
- ROE, ROA, EPS, P/E, P/B, Revenue Growth, etc.

### stock_ratios_extended (65,897 records)
13 chỉ số mở rộng - Liquidity & efficiency
- Current Ratio, Quick Ratio, Debt/Equity, Asset Turnover

### stock_ratios_banking (1,208 records)
Net Interest Margin cho 27 mã ngân hàng

**Chi tiết:** Xem [DATABASE_STRUCTURE.md](docs/DATABASE_STRUCTURE.md)

---

## 📋 Hướng dẫn vận hành

### Cập nhật dữ liệu tự động (Production)

Service tự động chạy **mỗi ngày 18:00** trên VPS:
- Fetch 1,556 cổ phiếu từ ticker_data.json (HOSE, HNX, UPCOM)
- Sync NIM cho banking stocks
- Restart gunicorn backend
- Thời gian: ~78 phút (delay 3s giữa mỗi request)

```bash
# Chạy thủ công
ssh root@203.55.176.10
sudo systemctl start stock-fetch.service

# Xem logs
sudo journalctl -u stock-fetch.service -n 50

# Xem lịch chạy tiếp theo
sudo systemctl list-timers stock-fetch.timer
```

**Chi tiết:** Xem [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md)

---

## 🔧 Deployment

### Deploy Backend + Database
```powershell
# From local Windows
.\automation\deploy_database.ps1

# Test API
curl https://api.quanganh.org/api/market/overview
```

### Deploy Frontend (Vercel)
```bash
git push origin main
# Vercel auto-deploy from GitHub
```

---

## 📖 Documentation

| File | Description |
|------|-------------|
| [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md) | **Hướng dẫn vận hành** - Update thủ công, check logs, troubleshooting |
| [DATABASE_STRUCTURE.md](docs/DATABASE_STRUCTURE.md) | Chi tiết schema V3, các bảng và columns |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Debug guide - Service, database, API issues |
| [NORMALIZED_SCHEMA_GUIDE.md](NORMALIZED_SCHEMA_GUIDE.md) | Migration V2→V3, optimization rationale |

---

## 🔑 API Endpoints

### Stock APIs
- `GET /api/stock/{symbol}` - Stock detail with financials
- `GET /api/stock/{symbol}/peers` - Peer comparison

### Market APIs
- `GET /api/market/overview` - All stocks overview (1500+)
- `GET /api/market/top-gainers` - Top 10 tăng giá
- `GET /api/market/top-losers` - Top 10 giảm giá
- `GET /api/market/top-value` - Top 10 giá trị giao dịch
- `GET /api/market/pe-chart` - P/E distribution data

### Gold APIs
- `GET /api/market/gold` - Gold prices (SJC, PNJ, DOJI)

---

## ⚡ Performance

### API Response Time
- **Average:** 30-50ms (cache hit)
- **Database queries:** < 10ms (11 indexes)
- **Gzip compression:** 8x data reduction
- **Cache hit rate:** > 80%

### Optimization Highlights
- V3 normalized schema: 54% storage savings vs V2 (609MB → 656MB populated)
- Smart TTL caching: 15-item LRU with 300s TTL
- Dual API keys: 120 requests/min throughput
- Batch queries: Multi-symbol fetch with connection pooling

---

## 🛡️ License

MIT License - See [LICENSE](LICENSE)

---

## 📞 Contact

**Developer:** Quang Anh  
**Website:** [quanganh.org](https://quanganh.org)  
**Email:** contact@quanganh.org

---

**Last Updated:** 2026-02-10  
**Schema Version:** V3 Normalized  
**Backend:** Flask + SQLite (656MB)  
**Frontend:** Next.js 15.1 (Vercel)  
**Automation:** systemd (daily 18:00)
