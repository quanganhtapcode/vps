
import json
import os
import requests
import concurrent.futures

# Đọc danh sách ticker từ file json
with open(r'c:\Users\PC\Downloads\Hello\frontend-next\public\ticker_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

tickers = [item['symbol'] for item in data['tickers']]
total = len(tickers)
downloaded = 0

def download_logo(symbol):
    try:
        url = f"https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/{symbol}.jpeg"
        filepath = f"c:\\Users\\PC\\Downloads\\Hello\\frontend-next\\public\\logos\\{symbol}.jpg"
        
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                f.write(response.content)
            print(f"✅ {symbol}", end=" ", flush=True)
            return True
        else:
            print(f"❌ {symbol}", end=" ", flush=True)
            return False
    except Exception as e:
        print(f"⚠️ {symbol}: {e}", end=" ", flush=True)
        return False

print(f"Bắt đầu tải {total} logo...")

# Sử dụng ThreadPoolExecutor để tải song song cho nhanh
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(download_logo, tickers))

success_count = sum(results)
print(f"\n\nHoàn thành! Thành công: {success_count}/{total}")
