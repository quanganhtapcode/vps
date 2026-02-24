import sqlite3
import pandas as pd
import numpy as np

db_path = "vietnam_stocks.db"

def test_fixed_query(symbol, limit=15):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # Get industry
    industry = conn.execute("SELECT icb_name4 FROM stock_industry WHERE ticker = ? LIMIT 1", (symbol,)).fetchone()[0]
    print(f"Industry: {industry}")
    
    # Fixed query using ROW_NUMBER to get the latest year per symbol
    query = """
        WITH latest_ratios AS (
            SELECT 
                fr.symbol, 
                fr.price_to_earnings as pe_ratio, 
                fr.price_to_book as pb_ratio,
                fr.market_cap_billions as market_cap,
                fr.year,
                ROW_NUMBER() OVER (PARTITION BY fr.symbol ORDER BY fr.year DESC) as rn
            FROM financial_ratios fr
            JOIN stock_industry si ON fr.symbol = si.ticker
            WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
        )
        SELECT symbol, pe_ratio, pb_ratio, market_cap, year
        FROM latest_ratios
        WHERE rn = 1
        ORDER BY market_cap DESC
        LIMIT ?
    """
    rows = conn.execute(query, (industry, limit)).fetchall()
    peers = [dict(r) for r in rows]
    
    print("\nPeers returned by fixed query:")
    for p in peers:
        print(f"Symbol: {p['symbol']}, PE: {p['pe_ratio']}, Year: {p['year']}, Market Cap: {p['market_cap']}")
        
    pe_values = [p['pe_ratio'] for p in peers if p.get('pe_ratio') and p['pe_ratio'] > 0]
    if pe_values:
        print(f"\nMedian PE: {np.median(pe_values)}")
    
    conn.close()

test_fixed_query('VCB')
