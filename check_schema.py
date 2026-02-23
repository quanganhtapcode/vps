import sqlite3

def check_schema():
    conn = sqlite3.connect('vietnam_stocks.db')
    cursor = conn.cursor()
    
    tables = ['income_statement', 'balance_sheet', 'cash_flow_statement', 'financial_ratios']
    
    with open('schema_output.txt', 'w') as f:
        for table in tables:
            f.write(f"\n--- {table} ---\n")
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in cursor.fetchall()]
            f.write(", ".join(columns) + "\n")
            
    conn.close()

if __name__ == "__main__":
    check_schema()
