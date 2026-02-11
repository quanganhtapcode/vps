import sqlite3

def check_scale(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT symbol, roe FROM stock_ratios_core WHERE symbol='VCB' LIMIT 1")
    row = cursor.fetchone()
    print(f"VCB in core: ROE = {row[1]}")
    
    cursor.execute("SELECT symbol, roe FROM stock_overview WHERE symbol='HPG' LIMIT 1")
    row = cursor.fetchone()
    print(f"HPG in overview: ROE = {row[1]}")
    conn.close()

if __name__ == "__main__":
    check_scale('stocks_vps.db')
