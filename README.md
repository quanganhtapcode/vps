# 🇻🇳 Vietnam Stock Valuation Tool

Ứng dụng định giá cổ phiếu Việt Nam - tự động tính toán giá trị nội tại dựa trên các phương pháp FCFE, FCFF, P/E, P/B.

🌐 **Website:** [valuation.quanganh.org](https://valuation.quanganh.org)

---

## 🚀 Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| **Định giá tự động** | Nhập mã cổ phiếu → Tính giá trị thực (FCFE, FCFF, P/E, P/B) |
| **Market Overview** | Trang tổng quan thị trường: VN-Index, HNX, VN30, UPCOM, P/E chart |
| **Dữ liệu Real-time** | API backend với auto-refresh mỗi 30 giây |
| **Sector Comparable** | So sánh P/E, P/B với top 10 công ty cùng ngành |
| **Tin tức thị trường** | Tin tức từ CafeF API, cập nhật liên tục |
| **Top Movers** | Cổ phiếu tăng/giảm mạnh nhất, giao dịch khối ngoại |
| **Biểu đồ TradingView** | Xem biến động giá, volume, chỉ báo kỹ thuật |
| **Export Excel** | Tải báo cáo định giá chi tiết |
| **Khuyến nghị** | Mua/Bán/Giữ dựa trên margin of safety 15% |
| **Responsive UI** | Giao diện tối ưu cho mobile và desktop |

---

## 📁 Cấu trúc Project

```
Valuation/
├── frontend/               # Giao diện web
│   ├── index.html          # Trang Market Overview
│   ├── valuation.html      # Trang định giá chi tiết
│   ├── css/
│   │   ├── overview.css    # CSS cho trang overview
│   │   ├── ticker-autocomplete.css
│   │   └── ...
│   ├── js/
│   │   └── overview.js     # JavaScript cho trang overview
│   └── ticker_data.json    # Dữ liệu autocomplete (1500+ mã)
├── backend/                # API Flask + Valuation Models
│   ├── server.py           # Main API server
│   ├── models.py           # FCFE, FCFF, P/E, P/B calculations
│   └── r2_client.py        # Cloudflare R2 storage client
├── automation/             # Scripts tự động hóa
│   ├── deploy.ps1          # Deploy code lên GitHub + VPS
│   ├── update_excel_data.py    # Cập nhật Excel → R2
│   ├── update_json_data.py     # Cập nhật stock JSON data
│   ├── update_tickers.py       # Cập nhật ticker_data.json
│   ├── update_peers.py         # Cập nhật sector peers
│   └── pull_data.ps1           # Tải data từ VPS về local
├── stocks/                 # Stock JSON data (700+ files)
├── docs/                   # Tài liệu hướng dẫn
├── .env                    # R2 credentials (gitignored)
├── requirements.txt        # Python dependencies
├── sector_peers.json       # Dữ liệu P/E, P/B ngành
└── stock_list.json         # Danh sách mã cổ phiếu
```

---

## 🛠️ Cài đặt Local

### 1. Clone & Setup
```bash
git clone https://github.com/quanganhtapcode/ec2.git
cd ec2

# Tạo virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate     # Linux/Mac

# Cài đặt dependencies
pip install -r requirements.txt
```

### 2. Chạy Backend
```bash
python backend/server.py
```
Server chạy tại: `http://localhost:5000`

### 3. Chạy Frontend
Mở `frontend/index.html` bằng browser hoặc dùng Live Server (VS Code).

---

## 🌐 API Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/market/realtime-market` | Dữ liệu chỉ số thị trường |
| `GET /api/market/realtime-chart` | Dữ liệu chart intraday |
| `GET /api/market/pe-chart` | P/E historical chart |
| `GET /api/market/news` | Tin tức từ CafeF |
| `GET /api/market/top-movers` | Cổ phiếu tăng/giảm mạnh |
| `GET /api/market/foreign-flow` | Giao dịch khối ngoại |
| `GET /api/valuation/<symbol>` | Dữ liệu định giá cổ phiếu |

---

## ☁️ Cloud Storage (Cloudflare R2)

Excel files được lưu trên **Cloudflare R2** thay vì VPS để:
- ✅ Giảm tải VPS
- ✅ Tốc độ download nhanh hơn (CDN)
- ✅ Tiết kiệm dung lượng VPS

Chi tiết: [docs/STORAGE.md](docs/STORAGE.md)

---

## 📚 Tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Hướng dẫn deploy code lên VPS |
| [docs/STORAGE.md](docs/STORAGE.md) | Cấu hình Cloudflare R2 storage |
| [docs/AUTOMATION.md](docs/AUTOMATION.md) | Scripts tự động hóa |

---

## 🔧 Dành cho Admin

### Deploy code mới
```powershell
.\automation\deploy.ps1 -CommitMessage "Mô tả thay đổi"
```

### Cập nhật dữ liệu
```powershell
# Cập nhật Excel (upload lên R2)
python automation/update_excel_data.py

# Cập nhật JSON data (chạy trên VPS)
python automation/update_json_data.py

# Cập nhật sector peers
python automation/update_peers.py

# Cập nhật ticker autocomplete data
python automation/update_tickers.py
```

### Tải data từ VPS về local
```powershell
.\automation\pull_data.ps1
```

---

## 📊 Cache Strategy

| Data Type | Cache TTL | Mô tả |
|-----------|-----------|-------|
| `realtime` | 30 giây | Dữ liệu giá realtime |
| `indices` | 30 giây | Chỉ số thị trường |
| `pe_chart` | 1 giờ | P/E historical |
| `news` | 5 phút | Tin tức |
| `reports` | 10 phút | Báo cáo phân tích |
| `chart_data` | 4 giờ | Historical chart data |
| `valuation_data` | 4 giờ | Dữ liệu định giá |

---

## 📄 License

MIT License - © 2025 Quang Anh
