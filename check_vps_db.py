import sqlite3
import pandas as pd

def check_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # List tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables:", [t[0] for t in tables])
    
    # For each table, show count and schema
    for table in [t[0] for t in tables]:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        print(f"\nTable: {table} ({count} rows)")
        
        cursor.execute(f"PRAGMA table_info({table})")
        columns = cursor.fetchall()
        for col in columns:
            print(f"  - {col[1]} ({col[2]})")
            
        # Sample data
        df = pd.read_sql_query(f"SELECT * FROM {table} LIMIT 2", conn)
        print("Sample Data:")
        print(df)

    conn.close()

if __name__ == "__main__":
    check_db('stocks_vps.db')
