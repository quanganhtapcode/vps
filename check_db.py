import sqlite3
import json

conn = sqlite3.connect('vietnam_stocks.db')
cursor = conn.cursor()
cursor.execute("SELECT data_json, revenue, net_profit_parent_company, net_profit FROM income_statement WHERE symbol='FPT' LIMIT 1")
rows = cursor.fetchall()
conn.close()

data = json.loads(rows[0][0])
for k, v in data.items():
    print(f"{k}: {v}")
