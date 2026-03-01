import sqlite3, json

DB = '/var/www/valuation/vietnam_stocks.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. VCB latest ratios from financial_ratios (real column names)
print('=== VCB financial_ratios ===')
cur.execute("""
    SELECT symbol, year, quarter, eps_vnd, bvps_vnd, price_to_earnings,
           price_to_book, roe, roa, market_cap_billions
    FROM financial_ratios
    WHERE symbol='VCB'
    ORDER BY year DESC, quarter DESC LIMIT 3
""")
for r in cur.fetchall():
    print(r)

# 2. VCB latest ratios - key fields
cur.execute("""
    SELECT ticker, year, quarter, eps, bvps, pe, pb, roe, roa, market_cap
    FROM financial_ratios 
    WHERE ticker='VCB' 
    ORDER BY year DESC, quarter DESC 
    LIMIT 3
""")
rows = cur.fetchall()
print('\n=== VCB financial_ratios (eps, bvps, pe, pb, roe, roa, market_cap) ===')
for r in rows:
    print(r)

# 3. Check company view for VCB
cur.execute("SELECT * FROM company WHERE symbol='VCB' LIMIT 1")
row = cur.fetchone()
cur.execute("PRAGMA table_info(company)")
ccols = [r[1] for r in cur.fetchall()]
print('\n=== company view VCB ===')
if row:
    for c, v in zip(ccols, row):
        print(f'  {c}: {v}')

# 4. Check ratio_wide columns
cur.execute('PRAGMA table_info(ratio_wide)')
rcols = [r[1] for r in cur.fetchall()]
print('\n=== ratio_wide columns ===')
print(rcols)

# 5. Check overview VCB
cur.execute("SELECT * FROM overview WHERE symbol='VCB' LIMIT 1")
row = cur.fetchone()
cur.execute("PRAGMA table_info(overview)")
ocols = [r[1] for r in cur.fetchall()]
print('\n=== overview VCB ===')
if row:
    for c, v in zip(ocols, row):
        if v is not None:
            print(f'  {c}: {v}')

# 6. Check what columns the valuation route uses
# stock_overview table check
cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print('\n=== All tables/views ===')
print(tables)

conn.close()
