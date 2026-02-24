import sqlite3
import os

db_path = r'c:\Users\PC\Downloads\Hello\vietnam_stocks.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Latest 10 ratios for VCB:")
    cursor.execute("SELECT year, quarter, eps_vnd, price_to_earnings FROM financial_ratios WHERE symbol = 'VCB' ORDER BY year DESC, quarter DESC LIMIT 10")
    rows = cursor.fetchall()
    for row in rows:
        print(f"Year: {row[0]}, Q: {row[1]}, EPS_VND: {row[2]}, P/E: {row[3]}")
            
    conn.close()
