# Database Structure Documentation

Cơ sở dữ liệu: **SQLite**
Path (VPS): `/var/www/valuation/stocks.db`

Hệ thống đã được tái cấu trúc vào **Tháng 2/2026** để tối ưu hóa hiệu năng truy xuất và loại bỏ dư thừa.

---

## 1. Table: `stock_overview`
**Vai trò:** Bảng quan trọng nhất. Chứa dữ liệu tổng hợp đã được tính toán sẵn (Pre-computed) cho mọi cổ phiếu. API lấy data chủ yếu từ bảng này.

| Column | Type | Description | Source Logic |
|--------|------|-------------|--------------|
| `symbol` | TEXT (PK) | Mã cổ phiếu (VD: VCB, HPG) | |
| `exchange` | TEXT | Sàn giao dịch (HOSE, HNX, UPCOM) | `companies` table |
| `industry` | TEXT | Ngành nghề cấp 1 hoặc 2 | `companies` table |
| **Valuation** | | | |
| `pe` | REAL | Price to Earnings Ratio | Latest Ratio Report (Quarterly) |
| `pb` | REAL | Price to Book Ratio | Latest Ratio Report (Quarterly) |
| `ps` | REAL | Price to Sales Ratio | Latest Ratio Report (Quarterly) |
| `ev_ebitda` | REAL | EV / EBITDA | Latest Ratio Report (Quarterly) |
| **Per Share** | | | |
| `eps_ttm` | REAL | Earnings Per Share (TTM) | Latest Ratio Report |
| `bvps` | REAL | Book Value Per Share | Latest Ratio Report |
| **Profitability** | | | |
| `roe` | REAL | Return on Equity (%) | Latest Ratio Report |
| `roa` | REAL | Return on Assets (%) | Latest Ratio Report |
| `net_profit_margin` | REAL | Biên lợi nhuận ròng (%) | Latest Ratio Report |
| `gross_margin` | REAL | Biên lợi nhuận gộp (%) | Latest Ratio Report |
| **Financials** | | | |
| `revenue` | REAL | Doanh thu thuần (VND) | **TTM (Sum 4 Quarters)** or Latest Year |
| `net_income` | REAL | Lợi nhuận sau thuế (VND) | **TTM (Sum 4 Quarters)** or Latest Year |
| `total_assets` | REAL | Tổng tài sản (VND) | **Snapshot** (Latest Quarter) |
| `total_equity` | REAL | Vốn chủ sở hữu (VND) | **Snapshot** (Latest Quarter) |
| `total_debt` | REAL | Tổng nợ phải trả (Liabilities) | **Snapshot** (Latest Quarter) |
| `cash` | REAL | Tiền mặt & Tương đương tiền | **Snapshot** (Latest Quarter) |
| **Market** | | | |
| `market_cap` | REAL | Vốn hóa thị trường (VND) | Latest Ratio Report |
| `current_price` | REAL | Giá hiện tại (VND) | Derived from PE*EPS or MarketCap/Shares |
| `updated_at` | TIMESTAMP | Thời gian cập nhật cuối cùng | Auto Current Timestamp |

---

## 2. Table: `financial_statements`
**Vai trò:** Data Warehouse. Lưu trữ toàn bộ dữ liệu thô (Raw JSON) lấy từ nguồn API. Dùng để backup và tính toán lại khi cần.

| Column | Type | Description |
|--------|------|-------------|
| `symbol` | TEXT (PK Comp) | Mã cổ phiếu |
| `report_type` | TEXT (PK Comp) | Loại báo cáo: `income`, `balance`, `cashflow`, `ratio` |
| `period_type` | TEXT (PK Comp) | Kỳ báo cáo: `quarter`, `year` |
| `year` | INTEGER (PK Comp) | Năm báo cáo (VD: 2025) |
| `quarter` | INTEGER (PK Comp) | Quý (1, 2, 3, 4). Nếu period_type='year' thì là 0. |
| `data` | TEXT (JSON) | Nội dung JSON nguyên bản từ API |
| `updated_at` | TIMESTAMP | Thời gian fetch |

---

## 3. Table: `companies`
**Vai trò:** Lưu thông tin tĩnh về doanh nghiệp.

| Column | Type | Description |
|--------|------|-------------|
| `symbol` | TEXT (PK) | Mã cổ phiếu |
| `name` | TEXT | Tên công ty đầy đủ |
| `exchange` | TEXT | Sàn giao dịch |
| `industry` | TEXT | Phân loại ngành nghề |
| `company_profile` | TEXT | Mô tả hoạt động kinh doanh |
| `updated_at` | TIMESTAMP | Thời gian cập nhật |

---
*Last Updated: Feb 01, 2026*
