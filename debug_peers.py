import sqlite3
import pandas as pd
import numpy as np

db_path = "vietnam_stocks.db"

def check_peers(symbol):
    conn = sqlite3.connect(db_path)
    # 1. Get industry
    industry_query = "SELECT icb_name4 FROM stock_industry WHERE ticker = ? LIMIT 1"
    res = conn.execute(industry_query, (symbol,)).fetchone()
    if not res:
        print(f"No industry found for {symbol}")
        return
    industry = res[0]
    print(f"Industry for {symbol}: {industry}")
    
    # 2. Get peers and their P/E
    query = """
        SELECT 
            fr.symbol, 
            fr.price_to_earnings as pe_ratio, 
            fr.price_to_book as pb_ratio,
            fr.market_cap_billions as market_cap,
            fr.year, fr.quarter
        FROM financial_ratios fr
        JOIN stock_industry si ON fr.symbol = si.ticker
        WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
        ORDER BY fr.year DESC, fr.market_cap_billions DESC
    """
    df = pd.read_sql_query(query, conn, params=(industry,))
    print(f"\nPotential peers in {industry}:")
    print(df.head(20))
    
    pe_values = df['pe_ratio'].dropna()
    pe_values = pe_values[pe_values > 0]
    
    if not pe_values.empty:
        print(f"\nMedian PE calculation:")
        print(f"Values: {pe_values.tolist()}")
        print(f"Median: {np.median(pe_values)}")
    else:
        print("\nNo valid P/E values found.")
        
    conn.close()

check_peers('VCB')
