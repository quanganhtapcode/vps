# Migration Log

Ghi lại các thay đổi lớn về cấu trúc hệ thống.

---

## [2026-02-01] Major Refactor: Flat Database & Optimize Fetching

**Mục tiêu:** Tăng tốc độ API, đồng bộ dữ liệu chuẩn xác giữ các sàn (UPCOM/HOSE), và sửa lỗi thiếu dữ liệu.

**Thay đổi:**
1.  **Database:**
    *   **REMOVE:** Bảng `stock_prices` (Historical Prices) -> Giảm 90% dung lượng DB (từ 4GB -> 600MB).
    *   **REMOVE:** Bảng `ratios` (Raw Text) -> Chuyển sang xử lý trực tiếp từ `financial_statements`.
    *   **OPTIMIZE:** Bảng `stock_overview` được xây dựng lại (Rebuilt) với full columns (PE, PB, ROE, TTM Income...) được tính toán sẵn.

2.  **Data Logic:**
    *   **Income Statement:** Chuyển sang dùng logic **TTM (Trailing 12 Months)** = Tổng 4 quý gần nhất.
    *   **Balance Sheet:** Dùng Snapshot quý gần nhất (Latest Quarter).
    *   **Liabilities:** Map chính xác từ key `LIABILITIES` trong raw data để có `total_debt` chuẩn.
    *   **Industry:** Đồng bộ ngành nghề từ `ticker_data.json` local lên VPS để đảm bảo tính nhất quán (Peers comparison).
    *   **UPCOM Fix:** Sửa lỗi key tuple/string khiến UPCOM không load được chart.

3.  **Code:**
    *   Tích hợp `build_stock_overview` vào `fetch_financials_vps.py`. Data được tính toán ngay khi fetch.
    *   Loại bỏ các script thừa thãi, dọn dẹp code rác.

---

## [Prior Versions]
*(Old logs preserved below if any)*
