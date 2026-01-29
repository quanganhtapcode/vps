# ☁️ Cloudflare R2 Storage

## Tổng quan

Excel files (báo cáo tài chính ~700 mã) được lưu trên **Cloudflare R2** thay vì VPS local.

| Thông tin | Giá trị |
|-----------|---------|
| **Account ID** | 2fe56347256799c77191fc809ebdac8a |
| **Bucket** | data |
| **Folder** | excel/ |
| **Endpoint** | https://2fe56347...r2.cloudflarestorage.com |

---

## Lợi ích

- ✅ **Giảm tải VPS**: File Excel không chiếm dung lượng VPS
- ✅ **Tốc độ nhanh**: R2 có CDN toàn cầu
- ✅ **Tiết kiệm bandwidth**: User download trực tiếp từ R2
- ✅ **Bảo mật**: Pre-signed URLs hết hạn sau 60 giây

---

## Flow Download

```
User ─click download─> VPS (generate presigned URL)
                         │
                         └─redirect 302─> R2 CDN ──file──> User
```

**Ưu điểm:** VPS chỉ tạo URL, không tốn bandwidth download.

---

## Cấu hình

### 1. File `.env` (Local & VPS)

```env
R2_ACCOUNT_ID=2fe56347256799c77191fc809ebdac8a
R2_ACCESS_KEY_ID=588e8168b31e88d845383124fd89d0c5
R2_SECRET_ACCESS_KEY=e0778bfe8ff619ed406f04712be4ac9027e1843610774146a09ba1fe190189a4
R2_BUCKET_NAME=data
R2_ENDPOINT_URL=https://2fe56347256799c77191fc809ebdac8a.r2.cloudflarestorage.com
R2_EXCEL_FOLDER=excel
```

⚠️ **File `.env` đã được gitignore** - không bao giờ commit lên Git!

### 2. CORS trên R2 Bucket

Đã cấu hình trong Cloudflare Dashboard → R2 → bucket "data" → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://valuation.quanganh.org"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Cập nhật Excel Data

### Từ Local (có VietCap token)

```powershell
cd C:\Users\PC\Downloads\Valuation
.\venv\Scripts\Activate.ps1
python automation/update_excel_data.py
```

1. Download Excel từ VietCap API (sử dụng 10 workers để chạy song song)
2. Sau khi download xong toàn bộ, script sẽ tải hàng loạt lên Cloudflare R2

### Cập nhật Token VietCap

Khi token hết hạn, cập nhật `BEARER_TOKEN` trong file:
```
automation/update_excel_data.py
```

---

## Quản lý R2

### Xem danh sách files

```python
from backend.r2_client import get_r2_client
r2 = get_r2_client()
result = r2.list_excel_files(max_files=100)
print(f"Total files: {result['count']}")
```

### Upload file thủ công

```python
from backend.r2_client import get_r2_client
r2 = get_r2_client()

with open('VCB.xlsx', 'rb') as f:
    result = r2.upload_excel('VCB', f.read())
    print(result)
```

### Xóa file

```python
r2.delete_excel('VCB')
```

---

## Bảo mật

| Yếu tố | Mô tả |
|--------|-------|
| **Pre-signed URL** | Hết hạn sau 60 giây |
| **CORS** | Chỉ cho phép valuation.quanganh.org |
| **Credentials** | Lưu trong .env (gitignored) |
| **Access Key ID** | Public identifier, không nhạy cảm |
| **Secret Key** | Không bao giờ lộ ra ngoài |

### Nếu lộ Secret Key

1. Vào Cloudflare Dashboard → R2 → Manage API Tokens
2. **Revoke** token cũ
3. **Create** token mới
4. Cập nhật `.env` trên local và VPS
5. Restart service: `systemctl restart gunicorn-ec2`

---

## Fallback

Nếu R2 gặp sự cố, server tự động fallback sang folder `data/` local (nếu có file).
