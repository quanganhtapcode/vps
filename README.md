# Vietnam Stock Data Pipeline

Backend API + pipeline cập nhật dữ liệu hằng ngày cho thị trường chứng khoán Việt Nam.

> Frontend (Next.js) triển khai riêng trên Vercel từ nhánh `main`.  
> Database SQLite (`vietnam_stocks.db`) không commit vào git  tải từ **Releases** hoặc để pipeline tự build.

---

## Kiến trúc tổng quan

```
fetch_sqlite/                    real-time data (cron mỗi 515 phút)
   fetch_vci.py                  index history  fetch_sqlite/index_history.sqlite
   fetch_vci_screener.py         screening data  vci_screening.sqlite
   fetch_vci_news.py             AI news  vci_ai_news.sqlite
   fetch_vci_standouts.py        top tickers  vci_ai_standouts.sqlite
   backup_vci_screening.py       backup weekly

run_pipeline.py                  daily pipeline (systemd 18:00 VN)
   db_updater/                   fetch BCTC via vnstock API  vietnam_stocks.db
   scripts/sync_overview.py      sync ROE/ROA/PE/PB sang overview table

backend/                         Flask/FastAPI server (always-on service)
   server.py                     entry point
   routes/                       API endpoints
   services/                     business logic
   data_sources/                 SQLite readers

automation/                      systemd service/timer + deploy scripts
frontend-next/                   Next.js (Vercel)
```

---

## Cài đặt local

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# .venv/bin/activate            # Linux/Mac
pip install -r requirements.txt
```

Khởi động API server:

```bash
python backend/server.py
```

Chạy pipeline thủ công:

```bash
python run_pipeline.py
```

---

## Cấu hình (.env)

Copy `.env.example`  `.env` và điền:

| Biến | Mô tả |
|---|---|
| `VNSTOCK_API_KEY` | API key vnstock (lấy miễn phí tại vnstocks.com/login) |
| `STOCKS_DB_PATH` | Đường dẫn tới `vietnam_stocks.db` (tuỳ chọn, có default) |
| `R2_*` | Cloudflare R2 credentials (tuỳ chọn, dùng để export Excel) |

> **Quan trọng**: Nếu thiếu `VNSTOCK_API_KEY`, pipeline chạy dưới "Guest" (20 req/phút) và sẽ bị rate-limit crash.

---

## VPS  Lịch chạy tự động

| Schedule | Script | Dữ liệu |
|---|---|---|
| Mỗi 5 phút | `fetch_vci_screener.py` | Screening data |
| Mỗi 5 phút | `fetch_vci_news.py` | AI news |
| Mỗi 15 phút | `fetch_vci.py` | Index history |
| Mỗi giờ | `fetch_vci_standouts.py` | Top tickers |
| **18:00 hàng ngày** | `run_pipeline.py` (systemd) | BCTC 1500+ mã |
| Chủ nhật 03:00 | `backup_vci_screening.py` | Backup weekly |

Xem chi tiết vận hành: [MAINTENANCE_GUIDE.md](MAINTENANCE_GUIDE.md)

---

## Deploy lên VPS

```powershell
# Từ Windows, trong thư mục project root:
.\automation\deploy.ps1 -CommitMessage "update"

# Kèm upload DB mới:
.\automation\deploy.ps1 -CommitMessage "update" -IncludeDatabase
```

---

## Ghi chú frontend

Frontend gọi API qua same-origin proxy `/api` (xem `frontend-next/src/lib/api.ts`).  
Override bằng env `NEXT_PUBLIC_API_URL` nếu cần trỏ sang host khác.
