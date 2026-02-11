import sqlite3
import pandas as pd
import json

def debug_vcb(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print(f"DEBUGGING VCB in {db_path}")
    
    # 1. Check stock_overview
    print("\n--- [1] stock_overview ---")
    row = cursor.execute("SELECT * FROM stock_overview WHERE symbol='VCB'").fetchone()
    if row:
        d = dict(row)
        print(f"Basic: Industry={d.get('industry')}, Price={d.get('current_price')}, PE={d.get('pe')}, PB={d.get('pb')}")
        print(f"Profitability: ROE={d.get('roe')}, ROA={d.get('roa')}, NIM={d.get('nim')}")
    else:
        print("VCB NOT FOUND in stock_overview")

    # 2. Check stock_ratios_core
    print("\n--- [2] stock_ratios_core (Latest 4) ---")
    rows = cursor.execute("SELECT year, quarter, roe, roa, eps, pe, pb FROM stock_ratios_core WHERE symbol='VCB' ORDER BY year DESC, quarter DESC LIMIT 4").fetchall()
    for r in rows:
        print(dict(r))

    # 3. Check stock_ratios_banking
    print("\n--- [3] stock_ratios_banking (Latest 4) ---")
    rows = cursor.execute("SELECT year, quarter, nim FROM stock_ratios_banking WHERE symbol='VCB' ORDER BY year DESC, quarter DESC LIMIT 4").fetchall()
    for r in rows:
        print(dict(r))
        
    # 4. Check Raw Financial Statements (to see if data exists but not parsed)
    print("\n--- [4] financial_statements (Raw check) ---")
    rows = cursor.execute("SELECT report_type, period_type, year, quarter, updated_at FROM financial_statements WHERE symbol='VCB' ORDER BY year DESC, quarter DESC LIMIT 5").fetchall()
    for r in rows:
        print(dict(r))

    conn.close()

if __name__ == "__main__":
    debug_vcb('stocks_vps.db')
