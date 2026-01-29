import time
import sys
import os
import json

# Add current directory to sys.path so we can import backend
sys.path.append(os.getcwd())

from backend.data_sources.vci import VCIClient

symbol = "HPG"
print(f"Testing VCI API Details for {symbol}...")

start_time = time.time()
try:
    data = VCIClient.get_price_detail(symbol)
    end_time = time.time()
    
    duration = end_time - start_time
    print(f"Time taken: {duration:.4f} seconds")
    
    if data:
        print("\n--- DATA RETRIEVED ---")
        # Print specific fields user is interested in
        print(f"Symbol: {data.get('symbol')}")
        print(f"Current Price: {data.get('price')}")
        print(f"Open: {data.get('open')}")
        print(f"High: {data.get('high')}")
        print(f"Low: {data.get('low')}")
        print(f"Volume: {data.get('volume')}")
        print("-" * 20)
        print("Full Data Object:")
        print(data)
    else:
        print("Failed to get data.")
except Exception as e:
    print(f"Error: {e}")
