import sqlite3
import pandas as pd
import numpy as np

db_path = "vietnam_stocks.db"

def check_peers(symbol):
    conn = sqlite3.connect(db_path)
    # 1. Get industry
    industry_query = "SELECT icb_name4 FROM stock_industry WHERE ticker = ? LIMIT 1"
    res = conn.execute(industry_query, (symbol,)).fetchone()
    if not res: return
    industry = res[0]
    
    # 2. Get all ratios for peers to see what's happening
    query = """
        SELECT 
            fr.symbol, 
            fr.price_to_earnings as pe_ratio, 
            fr.year, fr.quarter
        FROM financial_ratios fr
        JOIN stock_industry si ON fr.symbol = si.ticker
        WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
        ORDER BY fr.symbol, fr.year DESC
    """
    df = pd.read_sql_query(query, conn, params=(industry,))
    print(f"Industry: {industry}")
    
    # Print list of P/E for each symbol (latest)
    latest_pe = df.groupby('symbol')['pe_ratio'].first()
    print("\nLatest PE for each bank:")
    print(latest_pe.sort_values())
    
    pe_list = latest_pe[latest_pe > 0].dropna().tolist()
    print(f"\nMedian of {len(pe_list)} samples: {np.median(pe_list)}")
    
    conn.close()

check_peers('VCB')
