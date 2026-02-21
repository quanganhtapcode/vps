# Vietnamese Stock Valuation Platform - Deployment & Data Flow Guide

## 1. Dữ liệu và Cơ sở dữ liệu (Database Data Flow)

Hệ thống hoạt động với 2 cơ sở dữ liệu chính:

### A. Core Database: `stocks_optimized.db` (Financial Data)
- **Kích thước / Dữ liệu:** ~380MB, chứa dữ liệu Báo Cáo Tài Chính (Cân Đối Kế Toán, KQKD, Lưu Chuyển Tiền Tệ), P/E, P/B, Định giá 10 năm của hơn 1,500 công ty.
- **Phương thức cập nhật:**
  - Tự động chạy mỗi ngày lúc **18:00 giờ VN** (sau khi chứng khoán đóng cửa) trên VPS thông qua systemd timer: `stock-fetch.timer` -> `stock-fetch.service`.
  - Service gọi script `run_pipeline.py`. Quy trình này incremental fetch (chỉ tải phần thiếu), tính toán các chỉ số `ratio_wide` và cuối cùng tổng hợp thành bảng `overview` siêu nhẹ để Backend query nhanh <5ms.
- **Vị trí file:** Nằm ở Root thư mục dự án `/var/www/valuation/stocks_optimized.db`.

### B. Fast-Moving Database: `fetch_sqlite/vci_screening.sqlite` (Realtime Market Data)
- **Kích thước / Dữ liệu:** ~2MB, chứa thông tin giao dịch trong ngày như Giá, KLGD, % Tăng giảm, Khối ngoại, Độ mạnh dòng tiền (Score).
- **Phương thức cập nhật:**
  - Cronjob tự động update mỗi 5 phút gọi file: `fetch_sqlite/fetch_vci_screener.py`.
  - Data được kéo với 10 threads song song, 1 lần pull RAW data (ko filter) và 1 lần pull Enhanced data (có lọc) ghép lại.
- **Vị trí file:** Nằm ở `/var/www/valuation/fetch_sqlite/vci_screening.sqlite`.

**Backup policy (VPS):**
- Backup **1 tuần / 1 lần** (cron Sunday 03:00) bằng `fetch_sqlite/backup_vci_screening.py`.
- Auto xoá backup cũ sau **30 ngày** (retention).
- Log: `/var/www/valuation/fetch_sqlite/cron_backup_vci_screening.log`.

### C. Fast-Moving Database: `fetch_sqlite/vci_ai_news.sqlite` (VCI AI News Cache)
- **Mục tiêu:** Prefetch news định kỳ để API đọc từ SQLite (tránh gọi upstream mỗi request).
- **Phương thức cập nhật:**
   - Cronjob chạy mỗi **5 phút** gọi: `fetch_sqlite/fetch_vci_news.py` (có thể chạy nhiều workers để fetch nhanh).
   - Backend ưu tiên đọc SQLite trong `/api/market/news` và `/api/stock/news/<symbol>`.
- **Vị trí file:** `/var/www/valuation/fetch_sqlite/vci_ai_news.sqlite`.

### D. Fast-Moving Database: `fetch_sqlite/vci_ai_standouts.sqlite` (VCI AI Standouts Cache)
- **Mục tiêu:** Cache payload AI standouts (top tickers) theo giờ để endpoint `/api/market/standouts` đọc nhanh.
- **Phương thức cập nhật:** Cronjob chạy mỗi **1 giờ** gọi: `fetch_sqlite/fetch_vci_standouts.py`.
- **Vị trí file:** `/var/www/valuation/fetch_sqlite/vci_ai_standouts.sqlite`.

---

## 2. API Endpoints Chính Mới Update

- **`/api/market/standouts`** (Mới): Dùng AI VietCap ranking để lấy ra Ticker Tích Cực (Positive). Sau đó lấy đủ thông số Realtime (Price, Change, RS Score) từ bảng `vci_screening.sqlite`.
- **`/api/market/top-movers`**: Load Top Gainers / Losers thẳng từ bảng `vci_screening.sqlite` dựa vào % giao động giá trong ngày, xử lý cực nhanh thay vì gọi sang VCI chậm chạp.
- **`/api/market/gold`**: Crawl giá vàng BTMC realtime (có Cache).

---

## 3. Cấu trúc File & Thư Mục (Code Organization)

Để dễ debug và tránh rác, project đã được refactor cực chuẩn chỉnh:

```text
/
├── backend/            # Web API Flask
│   ├── routes/         # Gồm các module API: market.py, stock_routes.py
│   ├── server.py       # Điểm khởi chạy của Gunicorn
│   └── data_sources/   # Nơi chứa config gọi tới cafeF / VCI / VNStock
│
├── frontend-next/      # Giao diện web NextJS 14
│   └── src/components/ # Component React thuần, được update Standouts Card
│
├── automation/         # Các scripts chạy ngoài luồng hoặc Deploy
│   ├── deploy.ps1             # Tool Deploy từ Windows Client -> VPS
│   ├── loop_screener.sh       # File bash dự phòng để chạy loop vĩnh viễn (nếu ko dùng cron)
│   ├── setup_cron_vps.sh      # Setup lịch Cron chạy trên VPS
│   └── *.service, *.timer     # Cấu hình systemD để chạy `run_pipeline.py`
│
├── fetch_sqlite/       # Logic về data tĩnh & động
│   ├── fetch_vci_screener.py  # Script 10 threads mới nhất
│   └── vci_screening.sqlite   # Kho chứa DB Realtime 5 phút update 1 lần
│
├── scripts/            # Script tiện ích cho Core Database (Run_pipeline)
│   ├── sync_overview.py       # Nén data sau khi load xong báo cáo tài chính
│   ├── download_logos.py
│   └── telegram_uptime_report.sh
│
├── run_pipeline.py     # Gọi toàn bộ logic crawl BCTC tài chính (Chạy lúc 18h)
├── fetch_stock_data.py # Logic fetch core được gọi bởi pipeline
└── stocks_optimized.db # Database gốc Core BCTC siêu lớn
```

---

## 4. Quản lý, Theo dõi & Gỡ lỗi

1. **Xem log Frontend / Backend Node/Python trên VPS:**
   Backend chạy qua `systemctl start valuation`, bạn có thể kiểm tra log backend bằng biến:
   ```bash
   journalctl -u valuation -n 50 --no-pager
   ```

2. **Xem log của Tiến trình Fetch Data BCTC lúc 18:00:**
   ```bash
   journalctl -u stock-fetch.service -n 50 --no-pager
   ```
   Hoặc xem file vật lý chứa toàn bộ logs pipeline: 
   ```bash
   cat /var/www/valuation/logs/pipeline.log
   ```

3. **Xem cron log của file Fast-Moving data 5 phút:**
   ```bash
   cat /var/www/valuation/fetch_sqlite/cron_screener.log
   ```

   **Xem cron log của News cache 5 phút:**
   ```bash
   cat /var/www/valuation/fetch_sqlite/cron_vci_ai_news.log
   ```

   **Xem cron log của Standouts cache (hourly):**
   ```bash
   cat /var/www/valuation/fetch_sqlite/cron_vci_ai_standouts.log
   ```

4. **Deploy Mới Lên VPS nhanh nhất:**
   Chỉ cần gõ:
   ```powershell
   .\automation\deploy.ps1 -CommitMessage "noi_dung_thay_doi"
   ```
   Nó sẽ tự push Git (để Vercel build frontend) đồng thời SCP (an toàn) cục Backend lên VPS và tự reload service.
