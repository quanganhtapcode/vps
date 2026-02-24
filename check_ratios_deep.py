import sqlite3
import os

db_path = r'c:\Users\PC\Downloads\Hello\vietnam_stocks.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("PRAGMA table_info(financial_ratios)")
    cols = [c[1] for c in cursor.fetchall()]
    print("Columns in financial_ratios:")
    for c in cols:
        if 'eps' in c.lower():
            print(f"- {c}")
            
    cursor.execute("SELECT year, quarter, eps_vnd, price_to_earnings, market_cap_billions, shares_outstanding_millions FROM financial_ratios WHERE symbol = 'VCB' ORDER BY year DESC, quarter DESC LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(f"Y: {row[0]}, Q: {row[1]}, EPS: {row[2]}, P/E: {row[3]}, MC: {row[4]}, Shares: {row[5]}")
            
    conn.close()
