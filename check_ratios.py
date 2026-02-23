import sqlite3
conn = sqlite3.connect('vietnam_stocks.db')
cursor = conn.cursor()
cursor.execute("SELECT year, quarter, COUNT(*) FROM financial_ratios WHERE symbol='FPT' AND quarter IS NULL GROUP BY year, quarter")
df = cursor.fetchall()
print(df)
conn.close()
