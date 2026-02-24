import sqlite3
import pandas as pd
import json

db_path = "vietnam_stocks.db"
symbol = 'VCB'

def inspect_ticker(sym):
    conn = sqlite3.connect(db_path)
    
    print(f"--- Balance Sheet for {sym} ---")
    query = f"SELECT * FROM balance_sheet WHERE symbol = '{sym}' ORDER BY year DESC, quarter DESC LIMIT 1"
    df_bs = pd.read_sql_query(query, conn)
    if not df_bs.empty:
        print(df_bs.to_dict(orient='records')[0])
    
    print(f"\n--- Income Statement for {sym} ---")
    query = f"SELECT * FROM income_statement WHERE symbol = '{sym}' ORDER BY year DESC, quarter DESC LIMIT 1"
    df_inc = pd.read_sql_query(query, conn)
    if not df_inc.empty:
        print(df_inc.to_dict(orient='records')[0])

    print(f"\n--- Cash Flow for {sym} ---")
    query = f"SELECT * FROM cash_flow_statement WHERE symbol = '{sym}' ORDER BY year DESC, quarter DESC LIMIT 1"
    df_cf = pd.read_sql_query(query, conn)
    if not df_cf.empty:
        print(df_cf.to_dict(orient='records')[0])

    conn.close()

inspect_ticker(symbol)
inspect_ticker('ACB')
