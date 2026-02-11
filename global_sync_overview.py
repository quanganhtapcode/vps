import sqlite3
import time

def global_sync_overview(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Starting Global Sync for {db_path}...")
    start_time = time.time()
    
    # We want to pull the latest ROE, ROA, PE, PB, EPS from stock_ratios_core
    # and update stock_overview.
    # We use a temporary table of latest ratios to speed up the process.
    
    cursor.execute("DROP TABLE IF EXISTS tmp_latest_ratios")
    cursor.execute("""
        CREATE TABLE tmp_latest_ratios AS
        SELECT symbol, roe, roa, pe, pb, eps, market_cap, outstanding_shares
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY year DESC, quarter DESC) as rn
            FROM stock_ratios_core
        ) WHERE rn = 1
    """)
    
    cursor.execute("CREATE INDEX idx_tmp_symbol ON tmp_latest_ratios(symbol)")
    
    # Update Overview
    # Note: Core ROE/ROA are decimals (0.16), Overview expects percentages (16.0)
    # We also attempt to calculate market_cap if it's still missing but we have price and shares
    cursor.execute("""
        UPDATE stock_overview
        SET 
            roe = (SELECT t.roe * 100 FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
            roa = (SELECT t.roa * 100 FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
            pe = (SELECT t.pe FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
            pb = (SELECT t.pb FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
            eps_ttm = (SELECT t.eps FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
            market_cap = COALESCE(
                (SELECT t.market_cap FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
                current_price * (SELECT t.outstanding_shares FROM tmp_latest_ratios t WHERE t.symbol = stock_overview.symbol),
                market_cap
            )
        WHERE EXISTS (SELECT 1 FROM tmp_latest_ratios t2 WHERE t2.symbol = stock_overview.symbol)
    """)
    
    affected = cursor.rowcount
    print(f"Updated {affected} stocks in stock_overview with latest ratios.")
    
    # Sync NIM as well
    cursor.execute("""
        UPDATE stock_overview
        SET nim = (
            SELECT b.nim
            FROM stock_ratios_banking b
            WHERE b.symbol = stock_overview.symbol
            ORDER BY b.year DESC, b.quarter DESC
            LIMIT 1
        )
        WHERE EXISTS (SELECT 1 FROM stock_ratios_banking b2 WHERE b2.symbol = stock_overview.symbol)
    """)
    print(f"Synced NIM for {cursor.rowcount} banking stocks.")
    
    cursor.execute("DROP TABLE tmp_latest_ratios")
    conn.commit()
    
    # Final check for VCB
    cursor.execute("SELECT symbol, roe, roa, nim, pe, pb FROM stock_overview WHERE symbol='VCB'")
    row = cursor.fetchone()
    print(f"\nFinal Check VCB: {row}")
    
    print(f"Sync completed in {time.time() - start_time:.2f}s")
    conn.close()

if __name__ == "__main__":
    # Use production path if on VPS, otherwise local copy
    import os
    prod_path = '/var/www/valuation/stocks.db'
    db_path = prod_path if os.path.exists(prod_path) else 'stocks_vps.db'
    global_sync_overview(db_path)
