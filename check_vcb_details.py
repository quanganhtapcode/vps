import sqlite3
import pandas as pd

db_path = "vietnam_stocks.db"

def check_vcb_details():
    conn = sqlite3.connect(db_path)
    
    # Check financial ratios (latest)
    query = "SELECT * FROM financial_ratios WHERE symbol = 'VCB' ORDER BY year DESC, quarter DESC LIMIT 5"
    df = pd.read_sql_query(query, conn)
    print("Latest Financial Ratios for VCB:")
    print(df[['year', 'quarter', 'price_to_earnings', 'price_to_book', 'market_cap_billions']].to_string())
    
    # Check income statement
    query = "SELECT * FROM income_statement WHERE symbol = 'VCB' ORDER BY year DESC, quarter DESC LIMIT 5"
    df_inc = pd.read_sql_query(query, conn)
    print("\nLatest Income Statement for VCB:")
    print(df_inc[['year', 'quarter', 'net_profit']].to_string())

    conn.close()

check_vcb_details()
