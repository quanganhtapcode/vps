from backend.stock_provider import StockDataProvider
import json

provider = StockDataProvider()

print("--- YEAR PERIOD ---")
data_year = provider.get_stock_data('VCB', period='year')
print(f"Latest Year: {data_year.get('latest_year')}, Quarter: {data_year.get('latest_quarter')}")
print(f"EPS: {data_year.get('eps_ttm')}")

print("\n--- QUARTER PERIOD ---")
data_quarter = provider.get_stock_data('VCB', period='quarter')
print(f"Latest Year: {data_quarter.get('latest_year')}, Quarter: {data_quarter.get('latest_quarter')}")
print(f"EPS: {data_quarter.get('eps_ttm')}")
