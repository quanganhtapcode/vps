import sqlite3
import pandas as pd

db_path = "vietnam_stocks.db"

def check_bank_cf(symbol):
    conn = sqlite3.connect(db_path)
    query = f"SELECT * FROM cash_flow_statement WHERE symbol = '{symbol}' ORDER BY year DESC LIMIT 1"
    df = pd.read_sql_query(query, conn)
    print(f"Cash Flow for {symbol}:")
    for col in df.columns:
        if df[col].iloc[0] != 0 and pd.notna(df[col].iloc[0]):
            print(f"{col}: {df[col].iloc[0]}")
    conn.close()

check_bank_cf('ACB')
print("\n" + "="*20 + "\n")
check_bank_cf('VCB')
