import sqlite3

DB = '/var/www/valuation/vietnam_stocks.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. Raw financial_ratios for VCB
print('=== VCB financial_ratios (raw) ===')
cur.execute("""SELECT symbol, year, quarter, eps_vnd, bvps_vnd, price_to_earnings,
    price_to_book, roe, roa, market_cap_billions, shares_outstanding_millions
    FROM financial_ratios WHERE symbol='VCB'
    ORDER BY year DESC, quarter DESC LIMIT 5""")
for r in cur.fetchall():
    print(dict(r))

# 2. What overview view shows for VCB
print('\n=== VCB from overview view ===')
cur.execute("PRAGMA table_info(overview)")
cols = [r['name'] for r in cur.fetchall()]
print('overview columns:', cols)
cur.execute("SELECT * FROM overview WHERE symbol='VCB' LIMIT 1")
row = cur.fetchone()
if row:
    for k, v in dict(row).items():
        if v is not None:
            print(f'  {k}: {v}')

# 3. Peers from overview for banking industry
print('\n=== Banking peers pe/pb from overview ===')
cur.execute("SELECT symbol, industry, pe, pb, roe, market_cap, eps_ttm, bvps FROM overview WHERE industry LIKE '%Ngân hàng%' AND symbol != 'VCB' LIMIT 10")
for r in cur.fetchall():
    print(dict(r))

# 4. Check industry field for VCB in overview
print('\n=== VCB industry check ===')
cur.execute("SELECT symbol, industry, pe, pb, eps_ttm, bvps, current_price, market_cap FROM overview WHERE symbol='VCB'")
row = cur.fetchone()
if row: print(dict(row))

# 5. Check what symbols have pe/pb populated in the overview
cur.execute("SELECT COUNT(*) as total FROM overview")
print('\n=== overview row count ===', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM overview WHERE pe IS NOT NULL AND pe > 0")
print('=== overview rows with pe > 0 ===', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM overview WHERE current_price IS NOT NULL AND current_price > 0")
print('=== overview rows with current_price > 0 ===', cur.fetchone()[0])

# 6. peers endpoint query: SELECT symbol, name, industry, exchange, pe, pb, roe, roa, market_cap, net_profit_margin, profit_growth, current_price
print('\n=== peers query result for VCB (banking) ===')
cur.execute("SELECT industry FROM overview WHERE symbol='VCB'")
row = cur.fetchone()
industry = row[0] if row else None
print('VCB industry:', industry)
if industry:
    cur.execute("""SELECT symbol, current_price, pe, pb, roe, roa, market_cap, net_profit_margin
        FROM overview WHERE industry = ? AND symbol != 'VCB' LIMIT 10""", (industry,))
    for r in cur.fetchall():
        print(dict(r))

conn.close()
