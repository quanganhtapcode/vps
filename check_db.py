import sqlite3
import json

db_path = "fetch_sqlite/VNINDEX.sqlite"
try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cur.fetchall()
    print(f"Tables: {tables}")
    
    if tables:
        table_name = tables[0][0]
        cur.execute(f"PRAGMA table_info({table_name});")
        columns = cur.fetchall()
        print(f"Columns in {table_name}: {[c[1] for c in columns]}")
        
        cur.execute(f"SELECT * FROM {table_name} ORDER BY tradingDate DESC LIMIT 5;")
        rows = cur.fetchall()
        print(f"Rows: {rows}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
