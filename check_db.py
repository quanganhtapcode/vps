import sqlite3
import pandas as pd
conn = sqlite3.connect('vietnam_stocks.db')
cursor = conn.cursor()
cursor.execute("SELECT year, quarter, id FROM income_statement WHERE symbol='FPT' AND (quarter IS NULL OR quarter=0) GROUP BY year, quarter ORDER BY year DESC")
df = cursor.fetchall()
print(df)
conn.close()
