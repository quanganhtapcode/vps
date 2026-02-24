import sqlite3
import os

db_path = r'c:\Users\PC\Downloads\Hello\vietnam_stocks.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT quarter FROM financial_ratios")
    print("Distinct quarters in financial_ratios:", cursor.fetchall())
    conn.close()
else:
    print("DB not found")
