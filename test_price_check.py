import sys; sys.path.insert(0, '.')
from backend.data_sources.bsc_ws import BSCWebSocket
from backend.data_sources.vci import VCIClient

print("Loading BSC snapshot...")
BSCWebSocket._load_snapshot()

cache = VCIClient._price_cache
print(f"Cache: {len(cache)} symbols\n")

TEST = ['VCB', 'TCB', 'VNM', 'HPG', 'FPT', 'SSI', 'MBB', 'BID', 'CTG', 'ACB']

# ── 1. Kiểm tra fields thực tế trong cache entry ──
print("=" * 60)
print("1. RAW CACHE FIELDS (BSC snapshot)")
print("=" * 60)
sample = cache.get('VCB', {})
print(f"VCB keys: {sorted(sample.keys())}")
print(f"  c={sample.get('c')}  ref={sample.get('ref')}  ceil={sample.get('ceil')}  flo={sample.get('flo')}")
print(f"  open={sample.get('open')}  high={sample.get('high')}  low={sample.get('low')}")
print(f"  -- Old VCI keys (should all be None) --")
print(f"  cei={sample.get('cei')}  op={sample.get('op')}  h={sample.get('h')}  l={sample.get('l')}  va={sample.get('va')}")

# ── 2. Test get_price_detail() ──
print()
print("=" * 60)
print("2. get_price_detail() OUTPUT  (xem ceiling/floor/open/high/low có = 0 không)")
print("=" * 60)
print(f"{'SYM':<6} {'price':>8} {'ref':>8} {'ceiling':>9} {'floor':>8} {'open':>8} {'high':>8} {'low':>8}")
print("-" * 70)
for sym in TEST:
    d = VCIClient.get_price_detail(sym)
    if d:
        price = d.get('price', 0)
        ref   = d.get('ref_price', 0)
        ceil_ = d.get('ceiling', 0)
        flo   = d.get('floor', 0)
        op    = d.get('open', 0)
        hi    = d.get('high', 0)
        lo    = d.get('low', 0)
        warn = " ⚠ WRONG" if ceil_ == 0 or flo == 0 else ""
        print(f"{sym:<6} {price:>8,.0f} {ref:>8,.0f} {ceil_:>9,.0f} {flo:>8,.0f} {op:>8,.0f} {hi:>8,.0f} {lo:>8,.0f}{warn}")
    else:
        print(f"{sym:<6} NOT FOUND")

# ── 3. Test heatmap price + change logic ──
print()
print("=" * 60)
print("3. HEATMAP CHANGE% (giá và % thay đổi)")
print("=" * 60)
print(f"{'SYM':<6} {'price(c)':>10} {'ref':>8} {'change%':>10}  {'ch(raw)':>10} {'chp(raw)':>10}")
print("-" * 65)
for sym in TEST:
    item = cache.get(sym, {})
    if not item:
        print(f"{sym:<6} NOT FOUND"); continue
    price = item.get('c') or 0
    ref   = item.get('ref') or 0
    # heatmap logic:
    if ref and ref > 0:
        change = round((price - ref) / ref * 100, 4)
    else:
        change = 0
    ch_raw  = item.get('ch', 'N/A')   # change from snapshot
    chp_raw = item.get('chp', 'N/A')  # changepct from snapshot
    warn = " ⚠ ref=0" if ref == 0 else ""
    print(f"{sym:<6} {price:>10,.0f} {ref:>8,.0f} {change:>10.2f}%  {str(ch_raw):>10} {str(chp_raw):>10}{warn}")

# ── 4. /prices endpoint simulation ──
print()
print("=" * 60)
print("4. /api/market/prices ENDPOINT SIMULATION")
print("=" * 60)
result = {}
for sym, item in cache.items():
    price = float(item.get("c") or item.get("ref") or 0)
    ref   = float(item.get("ref") or 0)
    change = round(price - ref, 2) if ref > 0 else 0
    change_pct = round((change / ref) * 100, 2) if ref > 0 else 0
    result[sym] = {"price": price, "change": change, "changePercent": change_pct}

zero_ref = sum(1 for v in result.values() if v['changePercent'] == 0 and v['price'] > 0)
total = len(result)
print(f"  Total: {total} symbols")
print(f"  Symbols with price>0 but changePercent=0 (ref missing): {zero_ref}")
print()
for sym in TEST:
    v = result.get(sym)
    if v:
        warn = " ⚠ ref missing" if v['changePercent'] == 0 and v['price'] > 0 else ""
        print(f"  {sym}: price={v['price']:,.0f}  change={v['change']:+,.0f}  {v['changePercent']:+.2f}%{warn}")

print("\nDONE")
