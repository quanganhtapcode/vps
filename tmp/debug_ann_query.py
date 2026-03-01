import sqlite3

DB = '/var/www/valuation/vietnam_stocks.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Check what actually qualifies as "annual" for VCB
print('=== VCB rows WHERE quarter IS NULL ===')
cur.execute("SELECT rowid, symbol, year, quarter, period, eps_vnd, bvps_vnd, price_to_earnings, price_to_book, market_cap_billions FROM financial_ratios WHERE symbol='VCB' AND quarter IS NULL ORDER BY rowid DESC LIMIT 5")
for r in cur.fetchall(): print(dict(r))

print('\n=== VCB rows WHERE quarter IS NOT NULL (latest 5 by rowid) ===')
cur.execute("SELECT rowid, symbol, year, quarter, period, eps_vnd, bvps_vnd, price_to_earnings, price_to_book FROM financial_ratios WHERE symbol='VCB' AND quarter IS NOT NULL ORDER BY rowid DESC LIMIT 5")
for r in cur.fetchall(): print(dict(r))

# Check what fr_ann subquery returns for VCB
print('\n=== fr_ann subquery result for VCB ===')
cur.execute("""
    SELECT * FROM financial_ratios f1
    WHERE f1.rowid = (
        SELECT MAX(f2.rowid) FROM financial_ratios f2
        WHERE f2.symbol = f1.symbol AND f2.quarter IS NULL
    ) AND f1.symbol = 'VCB'
""")
row = cur.fetchone()
if row: print(dict(row))
else: print('  NO ANNUAL ROW FOUND')

# Check what fr_qtr subquery returns for VCB
print('\n=== fr_qtr subquery result for VCB ===')
cur.execute("""
    SELECT rowid, symbol, year, quarter, period, eps_vnd, price_to_earnings FROM financial_ratios f1
    WHERE f1.rowid = (
        SELECT MAX(f2.rowid) FROM financial_ratios f2
        WHERE f2.symbol = f1.symbol AND f2.quarter IS NOT NULL
    ) AND f1.symbol = 'VCB'
""")
row = cur.fetchone()
if row: print(dict(row))

# Check period values
print('\n=== Distinct period values for VCB ===')
cur.execute("SELECT DISTINCT period, quarter FROM financial_ratios WHERE symbol='VCB' LIMIT 10")
for r in cur.fetchall(): print(r['period'], r['quarter'])

# Check count of annual rows overall
print('\n=== Count annual rows (quarter IS NULL) overall ===')
cur.execute("SELECT COUNT(DISTINCT symbol) FROM financial_ratios WHERE quarter IS NULL")
print('symbols with annual row:', cur.fetchone()[0])

# What's in the overview for VCB specifically
print('\n=== overview VCB final values ===')
cur.execute("SELECT symbol, pe, pb, eps_ttm, bvps, market_cap, roe FROM overview WHERE symbol='VCB'")
row = cur.fetchone()
if row: print(dict(row))

conn.close()
