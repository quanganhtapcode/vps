# Kiến trúc Hệ thống

## Tổng quan

```
                    ┌─────────────────────────────────────┐
                    │          VPS (203.55.176.10)         │
                    │                                     │
  18:00 daily  ─── │  systemd stock-fetch.timer           │
                    │    └─► run_pipeline.py               │
                    │          └─► db_updater              │  ─► vietnam_stocks.db
                    │              (vnstock API)           │
                    │                                     │
  cron */5min  ─── │  fetch_vci_screener.py               │  ─► vci_screening.sqlite
  cron */5min  ─── │  fetch_vci_news.py                   │  ─► vci_ai_news.sqlite
  cron */15min ─── │  fetch_vci.py                        │  ─► index_history.sqlite
  cron */1h    ─── │  fetch_vci_standouts.py              │  ─► vci_ai_standouts.sqlite
                    │                                     │
  always-on    ─── │  backend/server.py (gunicorn)        │
                    │    ├── routes/stock_routes.py        │  ◄── reads vietnam_stocks.db
                    │    ├── routes/market.py              │  ◄── reads index_history.sqlite
                    │    ├── routes/valuation_routes.py    │  ◄── reads vci_screening.sqlite
                    │    └── routes/download_routes.py     │  ◄── Cloudflare R2
                    └─────────────────────────────────────┘
                                  │
                              nginx proxy
                                  │
                         ┌────────┴────────┐
                         │   Vercel CDN    │
                         │  frontend-next  │
                         └─────────────────┘
```

---

## Hai luồng dữ liệu độc lập

### Luồng 1: Real-time (crontab)

Chạy liên tục, không phụ thuộc `run_pipeline.py`.

```
VCI API (iq.vietcap.com.vn / ai.vietcap.com.vn)
  │
  ├─ fetch_vci.py          → index_history.sqlite
  ├─ fetch_vci_screener.py → vci_screening.sqlite
  ├─ fetch_vci_news.py     → vci_ai_news.sqlite
  └─ fetch_vci_standouts.py→ vci_ai_standouts.sqlite
```

### Luồng 2: Daily BCTC (systemd)

Chạy 18:00 hàng ngày, dùng vnstock API (cần `VNSTOCK_API_KEY`).

```
vnstock API
  │
  └─ run_pipeline.py
       ├─ db_updater/scripts/cli/update_financial_reports.py
       │    └─ StockDatabase (db_updater/stock_database/)
       │         ├─ balance_sheet
       │         ├─ income_statement
       │         ├─ cash_flow_statement
       │         └─ financial_ratios
       │                         → vietnam_stocks.db
       │
       └─ scripts/sync_overview.py   → cập nhật bảng overview
```

---

## Cấu trúc DB (vietnam_stocks.db)

Các bảng chính backend đọc:

| Bảng | Mô tả |
|---|---|
| `overview` | Tổng quan cổ phiếu (giá, PE, PB, ROE, market_cap…) |
| `balance_sheet` | Bảng cân đối kế toán (năm/quý) |
| `income_statement` | Kết quả kinh doanh |
| `cash_flow_statement` | Lưu chuyển tiền tệ |
| `financial_ratios` / `ratio_wide` | Tỷ số tài chính |
| `company` | Thông tin cơ bản doanh nghiệp |
| `stock_industry` | Phân loại ngành ICB |

---

## Backend API (backend/server.py)

| Prefix | Module | Mô tả |
|---|---|---|
| `/api/stock/` | `routes/stock_routes.py` | Dữ liệu cổ phiếu, tài chính |
| `/api/market/` | `routes/market.py` | Index, screener, news, standouts |
| `/api/valuation/` | `routes/valuation_routes.py` | DCF, so sánh ngành |
| `/api/download/` | `routes/download_routes.py` | Export Excel (R2) |

---

## Môi trường biến

| Biến | Mặc định | Mô tả |
|---|---|---|
| `VNSTOCK_API_KEY` | — | **Bắt buộc** cho daily pipeline |
| `STOCKS_DB_PATH` | auto-resolve | Override đường dẫn DB |
| `FETCH_DELAY_SECONDS` | `1.2` | Delay giữa các mã |
| `FETCH_PERIOD` | `year` | `year` hoặc `quarter` |
| `R2_*` | — | Cloudflare R2 (tuỳ chọn) |
