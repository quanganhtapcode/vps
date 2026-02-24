import sqlite3
import pandas as pd

db_path = "vietnam_stocks.db"

def check_bank_spec(symbol):
    conn = sqlite3.connect(db_path)
    query = f"SELECT symbol, year, depreciation_fixed_assets, purchase_purchase_fixed_assets FROM cash_flow_statement WHERE symbol = '{symbol}' ORDER BY year DESC LIMIT 5"
    df = pd.read_sql_query(query, conn)
    print(df)
    conn.close()

check_bank_spec('ACB')
print("\n")
check_bank_spec('VCB')
