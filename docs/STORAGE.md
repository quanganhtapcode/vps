# Data Storage Architecture

Hệ thống sử dụng **SQLite** làm cơ sở dữ liệu chính vì tính đơn giản, tốc độ đọc cực nhanh (file-based) và dễ dàng backup/đồng bộ.

**File Path (VPS):** `/var/www/valuation/stocks.db`

---

## 📅 Database Schema (v3.0 - Optimized Feb 2026)

Lược đồ CSDL đã được tinh gọn, loại bỏ các bảng ít dùng (`stock_prices` history, `ratios` raw cũ) để tập trung vào hiệu năng truy vấn Dashboard.

### 1. `stock_overview` (Core Table)
Bảng phẳng (Flat Table) chứa dữ liệu tổng hợp cho từng mã cổ phiếu. Đây là nguồn dữ liệu chính cho API.

*   **Primary Key:** `symbol` (TEXT)
*   **Columns:**
    *   `pe`, `pb`, `ps`, `ev_ebitda` (Valuation Ratios)
    *   `eps_ttm`, `bvps` (Per Share Data)
    *   `roe`, `roa`, `roic`, `gross_margin`, `net_profit_margin` (Lợi nhuận)
    *   `revenue`, `net_income` (TTM - Trailing 12 Months)
    *   `total_assets`, `total_equity`, `total_debt`, `cash` (Latest Quarter Backup)
    *   `market_cap`, `shares_outstanding`
    *   `industry`, `exchange` (Phân loại)
    *   `updated_at` (Last Sync Time)

> **Lợi ích:** Truy vấn cực nhanh, không cần JOIN phức tạp. Dễ dàng Sort/Filter cho chức năng Screener.

### 2. `financial_statements` (Data Lake)
Lưu trữ toàn bộ báo cáo tài chính lịch sử dưới dạng JSON nguyên bản.

*   **Primary Key:** Composite (`symbol`, `report_type`, `period_type`, `year`, `quarter`)
*   **Columns:**
    *   `data`: JSON String chứa toàn bộ nội dung báo cáo (Income, Balance, Ratio, Cashflow).
    *   `report_type`: 'income' | 'balance' | 'cashflow' | 'ratio'

### 3. `companies` (Metadata)
Lưu thông tin hồ sơ doanh nghiệp.

*   `name`: Tên đầy đủ
*   `company_profile`: Mô tả kinh doanh
*   `exchange`: HOSE/HNX/UPCOM

---

## 🔄 Data Synchronization
Dữ liệu được đồng bộ theo chiều:
`API Vnstock` -> `VPS Script (Fetch & Build)` -> `stocks.db` -> `Flask API` -> `Frontend`

---

## ⚠️ Notes
*   Bảng `stock_prices` (lịch sử giá) đã bị **LOẠI BỎ**. Frontend hiện lấy dữ liệu biểu đồ trực tiếp từ API của TradingView hoặc Fireant nếu cần (client-side fetching) hoặc dùng API `historical-chart-data` (được cache ngắn hạn nếu triển khai lại).
*   Đừng bao giờ commit file `stocks.db` lên Git (kích thước lớn >500MB). Hãy dùng SCP để tải về local.
