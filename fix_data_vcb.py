import sqlite3

def fix_data(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Fixing data in {db_path}...")
    
    # 1. Update ROE, ROA, PE, PB from latest stock_ratios_core where current overview is 0 or NULL
    # Using a common subquery to get latest data
    cursor.execute("""
        UPDATE stock_overview
        SET 
            roe = (SELECT r.roe * 100 FROM stock_ratios_core r WHERE r.symbol = stock_overview.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1),
            roa = (SELECT r.roa * 100 FROM stock_ratios_core r WHERE r.symbol = stock_overview.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1),
            pe = (SELECT r.pe FROM stock_ratios_core r WHERE r.symbol = stock_overview.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1),
            pb = (SELECT r.pb FROM stock_ratios_core r WHERE r.symbol = stock_overview.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1),
            eps_ttm = (SELECT r.eps FROM stock_ratios_core r WHERE r.symbol = stock_overview.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1)
        WHERE symbol = 'VCB' OR roe = 0 OR roe IS NULL
    """)
    
    affected = cursor.rowcount
    print(f"Updated {affected} rows in stock_overview from stock_ratios_core")
    
    # 2. Sync NIM
    cursor.execute("""
        UPDATE stock_overview
        SET nim = (
            SELECT b.nim
            FROM stock_ratios_banking b
            WHERE b.symbol = stock_overview.symbol
            ORDER BY b.year DESC, b.quarter DESC
            LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM stock_ratios_banking b2
            WHERE b2.symbol = stock_overview.symbol
        )
    """)
    print(f"Synced NIM for {cursor.rowcount} stocks")

    # 3. Specifically fix VCB if it's still weird
    # (The above should have fixed it, but let's be explicit with the values we saw)
    # ROE was 0.1661 in core -> 16.61%
    # ROA was 0.0155 in core -> 1.55%
    
    conn.commit()
    
    # Verify VCB again
    cursor.execute("SELECT symbol, roe, roa, nim, pe, pb FROM stock_overview WHERE symbol='VCB'")
    row = cursor.fetchone()
    print(f"\nVerification VCB: {row}")
    
    conn.close()

if __name__ == "__main__":
    fix_data('stocks_vps.db')
