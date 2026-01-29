🌐 **Website:** [valuation.quanganh.org](https://valuation.quanganh.org) (Frontend deployed on **Vercel**)
💻 **API Backend:** [api.quanganh.org](https://api.quanganh.org) (Backend deployed on **VPS**)

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
├── frontend-next/          # Giao diện web (Next.js 14) - Deploy on Vercel
│   ├── src/
│   │   ├── app/            # App Router pages
│   │   ├── components/     # UI Components (Tremor, HeadlessUI)
│   │   └── lib/            # Utilities & Config
│   ├── public/             # Static assets (including backup /logos)
│   └── ...
├── backend/                # API Flask + Valuation Models - Deploy on VPS
│   ├── server.py           # Main API server
│   ├── stock_provider.py   # Data fetching & Processing logic
│   └── ...
├── automation/             # Scripts tự động hóa
│   ├── deploy.ps1          # Deploy code (Push to GitHub/Vercel + Sync VPS)
│   ├── download_logos.py   # Tải logo từ AWS S3 về local backup
│   ├── update_excel_data.py    # Cập nhật dữ liệu Excel
│   └── ...
├── stocks.db               # SQLite Database (Price, Financials, Profile)
├── stock_list.json         # Danh sách mã cổ phiếu gốc
└── sector_peers.json       # Dữ liệu P/E, P/B ngành
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

### Deploy hệ thống
```powershell
# Script sẽ tự động đẩy code lên Github (Vercel tự động build) và đồng bộ Backend lên VPS
.\automation\deploy.ps1 -CommitMessage "Cập nhật tính năng mới"
```

### Quản lý Logos
```powershell
# Tải/Cập nhật logo từ AWS S3 về thư mục local backup
python automation/download_logos.py
```

---

## 📄 License

MIT License - © 2025 Quang Anh
