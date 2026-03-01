#!/usr/bin/env python3
"""Broader valuation + peers test across multiple sectors."""
import json, sqlite3, urllib.request, sys

DB = '/var/www/valuation/vietnam_stocks.db'
BASE = 'http://localhost:8000'

# Mix: banks, tech, steel, consumer, real estate, insurance, pharma, retail
SYMBOLS = [
    'VCB','BID','CTG','TCB','MBB','ACB','VPB',  # banks
    'FPT','CMG',                                  # tech
    'HPG','HSG','NKG',                            # steel
    'VNM','SAB','MCH',                            # consumer/FMCG
    'VIC','VHM','NVL',                            # real estate
    'BVH','BMI',                                  # insurance
    'DHG','IMP',                                  # pharma
    'MWG','FRT',                                  # retail
    'GAS','PLX','PVS',                            # oil/gas
    'VJC','HVN',                                  # aviation
]

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# DB sanity
print(f"{'Symbol':<6} {'Industry':<30} {'PE':>6} {'PB':>5} {'EPS':>8} {'BVPS':>9} {'MarketCap':>12} {'ROE':>7}")
print('-'*90)
cur.execute(f"""
    SELECT symbol, industry, pe, pb, eps_ttm, bvps, market_cap, roe
    FROM overview WHERE symbol IN ({','.join('?'*len(SYMBOLS))})
    ORDER BY market_cap DESC
""", SYMBOLS)
rows = cur.fetchall()
for r in rows:
    mc = r['market_cap']/1e12 if r['market_cap'] else 0
    print(f"{r['symbol']:<6} {(r['industry'] or ''):<30} {r['pe']:>6.1f} {r['pb']:>5.2f} {r['eps_ttm']:>8.0f} {r['bvps']:>9.0f} {mc:>10.0f}T {r['roe']:>7.2%}")

# Check nulls/zeros
cur.execute("SELECT COUNT(*) FROM overview WHERE pe IS NULL OR pe = 0")
no_pe = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM overview")
total = cur.fetchone()[0]
print(f"\nPE coverage: {total-no_pe}/{total} ({(total-no_pe)/total:.0%})")
conn.close()

# API valuation spot-checks
print(f"\n{'Symbol':<6} {'Status':>6} {'Time':>7}  {'WeightedAvg':>12}  {'EPS_TTM':>8}  {'PE_industry':>12}")
print('-'*65)
import time
errors = []
for sym in SYMBOLS:
    t0 = time.time()
    try:
        req = urllib.request.Request(f'{BASE}/api/valuation/{sym}',
            method='POST', headers={'Content-Type':'application/json'}, data=b'{}')
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read())
        elapsed = time.time()-t0
        wa = d.get('valuations',{}).get('weighted_average',0)
        eps = d.get('inputs',{}).get('eps_ttm',0)
        pe_ind = d.get('inputs',{}).get('industry_median_pe_ttm_used',0)
        pe_n = d.get('inputs',{}).get('industry_pe_sample_size',0)
        flag = ' ⚠ low_eps' if eps < 100 else ''
        print(f"{sym:<6} {'200':>6} {elapsed:>6.2f}s  {wa:>12,.0f}  {eps:>8.0f}  {pe_ind:>7.1f}(n={pe_n}){flag}")
    except Exception as e:
        elapsed = time.time()-t0
        print(f"{sym:<6} {'ERR':>6} {elapsed:>6.2f}s  {str(e)[:50]}")
        errors.append(sym)

if errors:
    print(f"\n[WARN] Errors: {errors}")
else:
    print(f"\nAll {len(SYMBOLS)} symbols OK")
