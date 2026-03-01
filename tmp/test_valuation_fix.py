#!/usr/bin/env python3
"""Quick test: valuation + peers for multiple symbols after view fixes."""
import json, sqlite3, urllib.request

DB = '/var/www/valuation/vietnam_stocks.db'
BASE = 'http://localhost:8000'

SYMBOLS = ['VCB', 'ACB', 'FPT', 'VNM', 'HPG', 'MSN', 'MWG', 'VIC']

# ── DB snapshot ──────────────────────────────────────────────────────────────
print('=== overview view sanity check (first 8 rows) ===')
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("""
    SELECT symbol, industry, pe, pb, eps_ttm, bvps, market_cap, roe
    FROM overview
    WHERE symbol IN ('VCB','ACB','FPT','VNM','HPG','MSN','MWG','VIC')
    ORDER BY symbol
""")
for r in cur.fetchall():
    d = dict(r)
    mktcap_T = d['market_cap'] / 1e12 if d['market_cap'] else 0
    print(f"  {d['symbol']:6s}  pe={d['pe']:6.2f}  pb={d['pb']:5.2f}  eps_ttm={d['eps_ttm']:8.1f}  bvps={d['bvps']:9.1f}  mktcap={mktcap_T:.0f}T VND  roe={d['roe']:.2%}")

# ── Count how many stocks now have pe > 0
cur.execute("SELECT COUNT(*) FROM overview WHERE pe > 0")
with_pe = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM overview")
total = cur.fetchone()[0]
print(f'\n=== PE coverage: {with_pe}/{total} stocks have pe > 0 ===')
conn.close()

# ── API tests ────────────────────────────────────────────────────────────────
print('\n=== Valuation API tests ===')
for sym in SYMBOLS:
    try:
        req = urllib.request.Request(f'{BASE}/api/valuation/{sym}',
                                     method='POST',
                                     headers={'Content-Type': 'application/json'},
                                     data=b'{}')
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read())
        vals = d.get('valuations', {})
        wa = vals.get('weighted_average', 0)
        eps = d.get('inputs', {}).get('eps_ttm', 0)
        bvps = d.get('inputs', {}).get('bvps', 0)
        pe_used = d.get('inputs', {}).get('industry_median_pe_ttm_used', 0)
        pe_n = d.get('inputs', {}).get('industry_pe_sample_size', 0)
        print(f"  {sym:6s}  weighted_avg={wa:9,.0f}  eps_ttm={eps:7.1f}  bvps={bvps:8.1f}  industry_pe={pe_used:.1f}(n={pe_n})")
    except Exception as e:
        print(f"  {sym:6s}  ERROR: {e}")

print('\n=== Peers API tests ===')
for sym in ['VCB', 'FPT', 'HPG']:
    try:
        with urllib.request.urlopen(f'{BASE}/api/stock/peers/{sym}', timeout=10) as resp:
            d = json.loads(resp.read())
        peers = d.get('data', [])
        print(f"  {sym}: {len(peers)} peers")
        for p in peers[:4]:
            print(f"    {p['symbol']:6s} pe={p.get('pe',0):5.2f} pb={p.get('pb',0):5.2f} mktcap={p.get('market_cap',0)/1e12:.0f}T")
    except Exception as e:
        print(f"  {sym}: ERROR {e}")
