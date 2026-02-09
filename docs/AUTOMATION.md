# Automation Scripts

Tài liệu này mô tả các script tự động hóa vận hành hệ thống Valuation Platform.

## 1. Fetch & Build Data (Cốt lõi)
**Script:** `/var/www/valuation/fetch_financials_vps.py` (trên VPS)
**Local Path:** `fetch_financials_vps.py`

Đây là script quan trọng nhất, thực hiện toàn bộ quy trình ETL (Extract - Transform - Load):

### Quy trình hoạt động:
1.  **Extract:** Tải báo cáo tài chính (Income, Balance, Ratio, Cashflow) từ Vnstock API.
    *   *Smart Skip:* Chỉ tải dữ liệu quý mới nếu trong DB chưa có (tiết kiệm API request, tránh Rate Limit).
2.  **Transform (Analysis Builder):**
    *   **Financials:** Tính toán TTM Revenue/Net Income (Tổng 4 quý gần nhất).
    *   **Balance Sheet:** Lấy Snapshot tài sản/nợ tại quý gần nhất.
    *   **Ratios:** Map chính xác các chỉ số P/E, P/B, ROE... từ bảng Ratio gốc.
3.  **Load:** Lưu vào bảng `financial_statements` (Raw JSON) và `stock_overview` (Flat Data).

### Cách chạy:
```bash
# Mode Update: Chỉ quét các mã chưa cập nhật trong 24h (Khuyên dùng chạy hàng ngày)
python3 fetch_financials_vps.py --mode update

# Mode Full: Quét lại toàn bộ 1500+ mã (Dùng khi muốn refresh toàn bộ data)
python3 fetch_financials_vps.py --mode full
```

### Automation (Crontab):
Script được cấu hình chạy định kỳ trên VPS:
```bash
# Chạy update mỗi 30 phút (giờ hành chính)
*/30 9-15 * * 1-5 python3 /var/www/valuation/fetch_financials_vps.py --mode update >> /var/log/valuation.log 2>&1
```

---

## 2. Deploy Script
**Script:** `automation/deploy.ps1` (Local Windows)

Script giúp deploy code Backend từ Local lên VPS và Push code lên Github (để Vercel tự build Frontend).

### Cách dùng:
```powershell
.\automation\deploy.ps1 -CommitMessage "Update logic TTM Income"
```

### Các bước thực hiện:
1.  Git Add & Commit & Push.
2.  Nếu có thay đổi Backend, dùng `scp` để đẩy file `fetch_financials_vps.py` và `server.py` lên thư mục `/var/www/valuation/` trên VPS.
3.  Restart Service trên VPS (nếu cần).

---

## 3. Logo Downloader
**Script:** `automation/download_logos.py` (Deprecated)
*Script này hiện tại ít được sử dụng vì Logos đã ổn định trong thư mục `public/logos`.*

---

## 4. Maintenance Scripts (VPS)
Các lệnh SQL thường dùng để bảo trì Database:

```sql
-- Kiểm tra dung lượng DB
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();

-- Dọn dẹp dung lượng thừa
VACUUM;

-- Kiểm tra Coverage dữ liệu
SELECT count(*) FROM stock_overview WHERE revenue > 0;
```
