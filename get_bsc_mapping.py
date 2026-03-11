import requests
import json

exchanges = ['HOSE', 'HNX', 'UPCOM']
symbol_to_id = {}
id_to_symbol = {}

for ex in exchanges:
    url = f"https://priceapi.bsc.com.vn/datafeed/instruments?exchange={ex}"
    r = requests.get(url)
    if r.status_code == 200:
        data = r.json()
        items = data.get('d', [])
        for info in items:
            symbol = info.get('symbol')
            s_id = info.get('s')
            if symbol and s_id is not None:
                symbol_to_id[symbol] = s_id
                id_to_symbol[s_id] = symbol

print(f"Total symbols mapped: {len(symbol_to_id)}")

with open("bsc_mapping.json", "w") as f:
    json.dump({"symbol_to_id": symbol_to_id, "id_to_symbol": id_to_symbol}, f, indent=2)

print("Saved bsc_mapping.json")
