import sqlite3

def get_vietnam_stocks_data(db_path, symbol, period='year'):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Company Info
    cursor.execute("SELECT organ_name, organ_short_name FROM stocks WHERE ticker=?", (symbol,))
    company = cursor.fetchone()
    if not company: return None
    
    cursor.execute("SELECT icb_name2, icb_name3 FROM stock_industry WHERE ticker=?", (symbol,))
    industry = cursor.fetchone()
    
    cursor.execute("SELECT exchange FROM stock_exchange WHERE ticker=?", (symbol,))
    exchange = cursor.fetchone()
    
    cursor.execute("SELECT company_profile, history FROM company_overview WHERE symbol=?", (symbol,))
    overview = cursor.fetchone()
    
    # 2. Latest Financial Ratios
    period_filter = 'year' if period == 'year' else 'quarter'
    cursor.execute(f"SELECT * FROM financial_ratios WHERE symbol=? ORDER BY year DESC, quarter DESC LIMIT 1", (symbol,))
    ratios = cursor.fetchone()
    
    # 3. Construct the 'overview' legacy dict object
    data = {}
    if company:
        data['name'] = company['organ_name']
        data['symbol'] = symbol
    if industry:
        data['sector'] = industry['icb_name3'] or industry['icb_name2']
        data['industry'] = data['sector']
    if exchange:
        data['exchange'] = exchange['exchange']
    if overview:
        data['overview'] = {
            'description': overview['company_profile'] or overview['history'] or "No description available."
        }
    
    if ratios:
        data['pe'] = ratios['price_to_earnings']
        data['pb'] = ratios['price_to_book']
        data['ps'] = ratios['price_to_sales']
        data['eps_ttm'] = ratios['eps_vnd']
        data['bvps'] = ratios['bvps_vnd']
        data['roe'] = ratios['roe']
        data['roa'] = ratios['roa']
        data['roic'] = ratios['roic']
        data['net_profit_margin'] = ratios['net_profit_margin']
        data['gross_margin'] = ratios['gross_margin']
        data['debt_to_equity'] = ratios['debt_to_equity']
        data['current_ratio'] = ratios['current_ratio']
        data['quick_ratio'] = ratios['quick_ratio']
        data['cash_ratio'] = ratios['cash_ratio']
        data['market_cap'] = ratios['market_cap_billions'] * 1e9 if ratios['market_cap_billions'] else None
        data['shares_outstanding'] = ratios['shares_outstanding_millions'] * 1e6 if ratios['shares_outstanding_millions'] else None
        
    return data

if __name__ == '__main__':
    print(get_vietnam_stocks_data('vietnam_stocks.db', 'FPT'))
