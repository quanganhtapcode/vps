import sqlite3
import json
conn = sqlite3.connect('vietnam_stocks.db')
cursor = conn.cursor()
cursor.execute("SELECT * FROM financial_ratios WHERE symbol='FPT' ORDER BY year DESC, quarter DESC LIMIT 1")
row = cursor.fetchone()
if row:
    desc = [c[0] for c in cursor.description]
    for k, v in zip(desc, row):
        print(f"{k}: {v}")
else:
    print("No data")
conn.close()
