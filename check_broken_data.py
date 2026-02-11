import sqlite3

def check_broken_stocks(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Stocks where ROE or ROA is 0 in overview but exists in core
    cursor.execute("""
        SELECT o.symbol, o.roe as overview_roe, o.roa as overview_roa,
               (SELECT r.roe * 100 FROM stock_ratios_core r WHERE r.symbol = o.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1) as core_roe,
               (SELECT r.roa * 100 FROM stock_ratios_core r WHERE r.symbol = o.symbol ORDER BY r.year DESC, r.quarter DESC LIMIT 1) as core_roa
        FROM stock_overview o
        WHERE (o.roe = 0 OR o.roe IS NULL OR o.roa = 0 OR o.roa IS NULL)
        AND EXISTS (SELECT 1 FROM stock_ratios_core r2 WHERE r2.symbol = o.symbol AND r2.roe != 0 AND r2.roe IS NOT NULL)
    """)
    
    rows = cursor.fetchall()
    print(f"--- Stocks with ROE=0 in Overview but data in Core (Total found: {len(rows)}) ---")
    for r in rows[:20]: # Show first 20
        c_roe = f"{r['core_roe']:.2f}%" if r['core_roe'] is not None else "N/A"
        print(f"Symbol: {r['symbol']}, Overview ROE: {r['overview_roe']}, Core ROE: {c_roe}")
    if len(rows) > 20:
        print("...")

    # 2. Check for Bank stocks with missing NIM in overview
    cursor.execute("""
        SELECT o.symbol FROM stock_overview o
        WHERE o.industry = 'Ngân hàng' AND (o.nim = 0 OR o.nim IS NULL)
        AND EXISTS (SELECT 1 FROM stock_ratios_banking b WHERE b.symbol = o.symbol)
    """)
    missing_nim = cursor.fetchall()
    print(f"\n--- Bank stocks with missing NIM in Overview (Total: {len(missing_nim)}) ---")
    if missing_nim:
        print(f"Symbols: {[r['symbol'] for r in missing_nim]}")

    conn.close()

if __name__ == "__main__":
    check_broken_stocks('stocks_vps.db')
