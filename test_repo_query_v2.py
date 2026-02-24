import sqlite3
import pandas as pd
import numpy as np

db_path = "vietnam_stocks.db"

def test_repo_query(symbol, limit=15):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # Get industry
    industry = conn.execute("SELECT icb_name4 FROM stock_industry WHERE ticker = ? LIMIT 1", (symbol,)).fetchone()[0]
    print(f"Industry: {industry}")
    
    # The exact query but with YEAR
    query = """
        SELECT 
            fr.symbol, 
            fr.price_to_earnings as pe_ratio, 
            fr.year,
            fr.market_cap_billions as market_cap
        FROM financial_ratios fr
        JOIN stock_industry si ON fr.symbol = si.ticker
        WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
        GROUP BY fr.symbol
        ORDER BY fr.year DESC, fr.market_cap_billions DESC
        LIMIT ?
    """
    rows = conn.execute(query, (industry, limit)).fetchall()
    peers = [dict(r) for r in rows]
    
    print("\nPeers returned by query:")
    for p in peers:
        print(f"Symbol: {p['symbol']}, PE: {p['pe_ratio']}, Year: {p['year']}, Market Cap: {p['market_cap']}")
        
    conn.close()

test_repo_query('VCB')
