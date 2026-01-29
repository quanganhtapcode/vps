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
| **Responsive UI** | Giao diện Next.js tối ưu cho mobile và desktop |

---

## 📁 Cấu trúc Project

```
Valuation/
├── frontend-next/          # Giao diện web (Next.js 14)
│   ├── src/
│   │   ├── app/            # App Router pages
│   │   ├── components/     # UI Components (Tremor, HeadlessUI)
│   │   └── lib/            # Utilities & Config
│   ├── public/             # Static assets
│   └── ...
├── backend/                # API Flask + Valuation Models
│   ├── server.py           # Main API server
│   ├── stock_provider.py   # Data fetching & Processing logic
│   └── ...
├── automation/             # Scripts tự động hóa
│   ├── deploy.ps1          # Deploy code lên GitHub + VPS
│   ├── update_excel_data.py    # Cập nhật Excel
│   ├── update_json_data.py     # Cập nhật stock JSON data
│   ├── update_peers.py         # Cập nhật sector peers
│   └── pull_data.ps1           # Tải data từ VPS về local
├── stocks.db               # SQLite Database (Price, Financials, Profile)
├── docs/                   # Tài liệu hướng dẫn
├── .env                    # Environment variables
├── requirements.txt        # Python dependencies
├── sector_peers.json       # Dữ liệu P/E, P/B ngành
└── stock_list.json         # Danh sách mã cổ phiếu
```

---

## 🛠️ Cài đặt Local

### 1. Clone & Setup
```bash
git clone https://github.com/quanganhtapcode/vps.git
cd vps
```

### 2. Backend (Python/Flask)
```bash
# Tạo virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows
# source .venv/bin/activate   # Linux/Mac

# Cài đặt dependencies
pip install -r requirements.txt

# Chạy Backend
python backend/server.py
```
Server backend chạy tại: `http://localhost:5000`

### 3. Frontend (Next.js)
```bash
cd frontend-next

# Cài đặt dependencies
npm install

# Chạy dev server
npm run dev
```
Website chạy tại: `http://localhost:3000`

---

## 🌐 API Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/market/realtime-market` | Dữ liệu chỉ số thị trường |
| `GET /api/current-price/<symbol>` | Giá realtime & thay đổi |
| `GET /api/stock/<symbol>` | Thông tin cơ bản & Chỉ số tài chính |
| `GET /api/historical-chart-data/<symbol>` | Dữ liệu biểu đồ lịch sử |
| `GET /api/valuation/<symbol>` | Dữ liệu định giá cổ phiếu |
| `GET /api/news/<symbol>` | Tin tức mới nhất |

---

## 📚 Tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Hướng dẫn deploy code lên VPS |
| [docs/AUTOMATION.md](docs/AUTOMATION.md) | Scripts tự động hóa |

---

## 🔧 Dành cho Admin

### Deploy code mới
```powershell
.\automation\deploy.ps1 -CommitMessage "Mô tả thay đổi"
```

### Cập nhật dữ liệu
```powershell
# Cập nhật JSON data (chạy trên VPS)
python automation/update_json_data.py

# Cập nhật sector peers
python automation/update_peers.py
```

---

## 📄 License

MIT License - © 2025 Quang Anh
