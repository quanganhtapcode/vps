# Vietnam Stock Valuation (Minimal Runtime)

Repo đã được dọn gọn theo hướng production-first: chỉ giữ các thành phần cần để chạy API, frontend và pipeline cập nhật dữ liệu hằng ngày.

## Cấu trúc còn lại

- `backend/` Flask API + data provider + routes
- `frontend-next/` Next.js app (Vercel)
- `scripts/` script vận hành DB (`sync_overview.py`, `optimize_database.py`, `inspect_database.py`)
- `automation/` file systemd/timer và deploy helper
- `fetch_stock_data.py` fetch dữ liệu từ vnstock vào SQLite
- `run_pipeline.py` entrypoint daily pipeline
- `stocks.db` SQLite production database
- `symbols.txt` danh sách mã cần cập nhật

## Luồng dữ liệu

1. `fetch_stock_data.py` cập nhật bảng normalized ratios.
2. `scripts/sync_overview.py` đồng bộ chỉ số mới nhất sang `stock_overview` để API trả nhanh.
3. `automation/stock-fetch.service` gọi `run_pipeline.py`.
4. `automation/stock-fetch.timer` chạy daily lúc 18:00.

## Chạy local nhanh

```bash
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
python backend/server.py
```

## Chạy pipeline thủ công

```bash
python run_pipeline.py
```

## Ghi chú API frontend

Frontend mặc định gọi qua same-origin proxy `/api` (xem `frontend-next/src/lib/api.ts`) để cache/CORS ổn định; có thể override bằng `NEXT_PUBLIC_API_URL` nếu cần.
