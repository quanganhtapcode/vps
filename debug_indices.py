import requests
import json

url = "https://trading.vietcap.com.vn/api/price/marketIndex/getList"
payload = {"symbols": ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]}
headers = {
    'User-Agent': 'Mozilla/5.0',
    'Content-Type': 'application/json'
}

try:
    response = requests.post(url, json=payload, headers=headers, timeout=5)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        # Print summary for first item
        if data:
            print("Keys for first index:", data[0].keys())
            # Look for any list of prices/history
            for k, v in data[0].items():
                if isinstance(v, list):
                    print(f"Found list in key '{k}': {v[:5]}... (length: {len(v)})")
        with open('indices_sample.json', 'w') as f:
            json.dump(data, f, indent=2)
except Exception as e:
    print(f"Error: {e}")
