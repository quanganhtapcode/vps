# 📋 Tài Liệu Vận Hành Hệ Thống Tự Động (Automation Guide)

Tài liệu này giải thích chi tiết cách hệ thống tự động cập nhật dữ liệu chứng khoán, cách đồng bộ dữ liệu giữa VPS và Máy Local, và quy trình deploy lên Web.

---

## 1. Tổng Quan Kiến Trúc

```
┌─────────────────────────────────────────────────────────────┐
│                         VPS (Backend)                       │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ gunicorn-ec2    │    │ val-updater     │                │
│  │ (API Server)    │    │ (Data Updater)  │                │
│  │   Port 8000     │    │ Timer: Morning  │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      ▼                                      │
│  ┌─────────────────────────────────────────┐               │
│  │              stocks.db (SQLite)          │               │
│  │          sector_peers.json               │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
           │
           │ API Requests
           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Frontend)                      │
│  ┌─────────────────────────────────────────┐               │
│  │           valuation.quanganh.org        │               │
│  │      (Next.js App /logos backup)         │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
           │
           │ Asset Loading
           ▼
┌─────────────────────────────────────────────────────────────┐
│                         AWS S3                              │
│  ┌─────────────────────────────────────────┐               │
│  │           Stock Logos (.jpeg)            │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Services Trên VPS

### 📦 Danh sách Services
| Service | Mục đích | Timer |
| :--- | :--- | :--- |
| `gunicorn-ec2.service` | Web server cho API backend | Always running |
| `val-updater.service` | Cập nhật dữ liệu JSON cho stocks | Ngày 1, 15 lúc 2:00 AM |

### 🔧 val-updater Service

**Vị trí file service:**
```
/etc/systemd/system/val-updater.service
/etc/systemd/system/val-updater.timer
```

**Các lệnh quản lý:**
```bash
# Xem trạng thái
systemctl status val-updater.service
systemctl status val-updater.timer

# Chạy thủ công (nếu cần)
systemctl start val-updater.service

# Xem log
journalctl -u val-updater.service -n 100 -f

# Restart timer
systemctl restart val-updater.timer
```

---

## 3. Quy Trình Tự Động Trên VPS

### 🕒 Lịch chạy:
* **Thời gian**: 02:00 sáng.
* **Ngày chạy**: Ngày **01** và ngày **15** hàng tháng.
* **Cơ chế**: Systemd Timer (`val-updater.timer`) kích hoạt script chủ.

*   Hoàn thành cập nhật database và chỉ số ngành phục vụ cho API Valuation.

---

## 4. Cấu Trúc JSON Output

### stocks/{SYMBOL}.json
```json
{
  "symbol": "VIC",
  "name": "Tập đoàn Vingroup - Công ty CP",
  "exchange": "HSX",
  "sector": "Bất động sản",
  
  // Per-share metrics
  "eps_ttm": 1147.27,
  "bvps": 18908.57,
  "dividend_per_share": 0,
  
  // Valuation ratios
  "pe_ratio": 129.44,
  "pb_ratio": 7.85,
  "ps_ratio": 4.94,
  "ev_ebitda": 111.15,
  
  // Profitability
  "roe": 6.20,
  "roa": 0.96,
  "net_profit_margin": 1.64,
  "net_profit_growth": 15.5,
  
  // Liquidity & Leverage
  "current_ratio": 1.06,
  "quick_ratio": 0.73,
  "debt_to_equity": 5.72,
  
  // Other
  "current_price": 158800,
  "market_cap": 1144345607064000,
  "shares_outstanding": 7706031024,
  "last_updated": "2025-12-29T01:53:13"
}
```

---

## 5. Frontend File Structure

```
frontend-next/
├── src/
│   ├── app/                # App Router (Home, Market, Stock Detail)
│   ├── components/         # UI Elements (Charts, Lists)
│   └── lib/                # API helpers, Utils
├── public/
│   └── logos/              # Backup logos folder
```

---

## 6. Bảng Tóm Tắt File Script

| Tên File | Chạy Ở | Tự Động? | Chức Năng |
| :--- | :--- | :--- | :--- |
| `update_json_data.py` | VPS | ✅ (Ngày 1, 15) | **Tổng Chỉ Huy**. Điều phối cả quy trình. |
| `update_tickers.py` | VPS | (Được gọi) | Tạo data cho Autocomplete Search. |
| `generate_stock_list.py` | VPS | (Được gọi) | Tạo danh sách mã cần tải data. |
| `update_peers.py` | VPS | (Được gọi) | Tính toán chỉ số ngành. |
| `update_excel_data.py` | **Local** | ❌ (Chạy tay) | Tải Excel từ VietCap (10 workers) → Upload R2. |
| `deploy.ps1` | **Local** | ❌ (Chạy tay) | Đẩy code lên GitHub (Vercel) + Đồng bộ Backend VPS. |

---

## 7. Troubleshooting

### Xem log val-updater
```bash
ssh -i ~/Downloads/key.pem root@10.66.66.1 "journalctl -u val-updater.service -n 50"
```

### Kiểm tra rate limit
Nếu thấy log có `Rate limit! Wait Xs...`, đây là bình thường. Script tự động chờ và retry.

### Chạy lại thủ công
```bash
ssh -i ~/Downloads/key.pem root@10.66.66.1 "systemctl restart val-updater.service"
```

### Kiểm tra dữ liệu mới
```bash
ssh -i ~/Downloads/key.pem root@10.66.66.1 "cat /var/www/api.quanganh.org/stocks/VIC.json | head -20"
```

---

## 8. API Cache Strategy

| Data Type | Cache TTL | Endpoint |
|-----------|-----------|----------|
| `realtime` | 30 giây | `/api/market/realtime-market` |
| `indices` | 30 giây | `/api/market/indices` |
| `pe_chart` | 1 giờ | `/api/market/pe-chart` |
| `news` | 5 phút | `/api/market/news` |
| `reports` | 10 phút | `/api/market/reports` |
| `chart_data` | 4 giờ | `/api/historical-chart-data/<symbol>` |
| `valuation_data` | 4 giờ | `/api/valuation/<symbol>` |

---

## 9. Lưu Ý Quan Trọng

* **File `frontend/ticker_data.json`**: Quan trọng nhất cho trải nghiệm tìm kiếm.
* **Đừng sửa tay data**: Hạn chế sửa tay các file JSON trong thư mục `stocks/`, lần chạy tiếp theo sẽ bị ghi đè.
* **CSS/JS tách riêng**: `overview.css` và `overview.js` đã được tách ra file riêng cho dễ maintain.
* **Auto-refresh**: Frontend tự động refresh dữ liệu indices mỗi 30 giây.
