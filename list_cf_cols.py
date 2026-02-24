import sqlite3
conn = sqlite3.connect("vietnam_stocks.db")
cursor = conn.execute("PRAGMA table_info(cash_flow_statement)")
for row in cursor.fetchall():
    print(row[1])
conn.close()
