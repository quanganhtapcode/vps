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
    
    # 2. Get latest ratios for peers (distinct symbol)
    # We need to make sure we only get the LATEST year for each symbol
    query = """
        WITH latest_ratios AS (
            SELECT 
                symbol, pe_ratio, pb_ratio, market_cap, year,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY year DESC) as rn
            FROM (
                SELECT 
                    fr.symbol, 
                    fr.price_to_earnings as pe_ratio, 
                    fr.price_to_book as pb_ratio,
                    fr.market_cap_billions as market_cap,
                    fr.year
                FROM financial_ratios fr
                JOIN stock_industry si ON fr.symbol = si.ticker
                WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
            )
        )
        SELECT symbol, pe_ratio, pb_ratio, market_cap, year
        FROM latest_ratios
        WHERE rn = 1
        ORDER BY market_cap DESC
    """
    df = pd.read_sql_query(query, conn, params=(industry,))
    print(f"Industry: {industry}")
    print("\nPeers Data:")
    print(df[['symbol', 'pe_ratio', 'year']].to_string())
    
    pe_values = df['pe_ratio'].dropna()
    pe_values = pe_values[pe_values > 0]
    
    if not pe_values.empty:
        print(f"\nSorted PE list: {sorted(pe_values.tolist())}")
        print(f"Median PE: {np.median(pe_values)}")
    
    conn.close()

check_peers('VCB')
