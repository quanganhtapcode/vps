import sqlite3
import os

db_path = r'c:\Users\PC\Downloads\Hello\vietnam_stocks.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get columns of income_statement
    cursor.execute("PRAGMA table_info(income_statement)")
    cols = cursor.fetchall()
    print("Columns in income_statement:")
    col_names = [col[1] for col in cols]
    for name in col_names:
        print(f"- {name}")
        
    print("\nSample data for VCB:")
    cursor.execute("SELECT * FROM income_statement WHERE symbol = 'VCB' ORDER BY year DESC, quarter DESC LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        row_dict = dict(zip(col_names, row))
        print(f"Year: {row_dict['year']}, Q: {row_dict['quarter']}")
        # Common keys for net profit
        net_profit_keys = ['net_profit_parent_company', 'net_profit_parent_company_post', 'net_profit', 'profit_after_tax']
        for k in net_profit_keys:
            if k in row_dict:
                print(f"  {k}: {row_dict[k]}")
        # Common keys for EPS
        eps_keys = ['eps', 'eps_vnd', 'earnings_per_share']
        for k in eps_keys:
            if k in row_dict:
                print(f"  {k}: {row_dict[k]}")
            
    conn.close()
