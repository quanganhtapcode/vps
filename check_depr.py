import sqlite3
import pandas as pd

conn = sqlite3.connect("vietnam_stocks.db")
df = pd.read_sql_query("SELECT symbol, year, depreciation_fixed_assets FROM cash_flow_statement WHERE symbol IN ('ACB', 'VCB') ORDER BY symbol, year DESC", conn)
print(df)
conn.close()
