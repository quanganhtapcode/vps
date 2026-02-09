# 🚀 API Optimization Plan

**Date**: Feb 9, 2026  
**Goal**: Giảm response time xuống dưới 100ms cho tất cả core endpoints

---

## 📊 Phân tích hiện tại

### Bottlenecks đã phát hiện

| Endpoint | Current | Target | Priority | Issue |
|----------|---------|--------|----------|-------|
| Gold API | 1206ms | <100ms | 🔴 HIGH | External API call, no cache |
| PE Chart | 504ms | <200ms | 🟡 MEDIUM | Query 1500+ stocks, no index |
| Market Indices | 228ms | <100ms | 🟡 MEDIUM | Real-time aggregation |
| Stock Data | 10ms | <10ms | 🟢 LOW | Already optimal |
| Health/Cache | 5ms | <5ms | 🟢 LOW | Already optimal |

---

## 🎯 Optimization Strategies

### 1. **Caching Layer** 🔴 CRITICAL

#### A. In-Memory Cache (Python dict)
```python
# Simple TTL cache for fast access
cache = {
    'gold_prices': {
        'data': {...},
        'expires': timestamp
    }
}
```

**Benefits**:
- ✅ No external dependencies
- ✅ ~1ms access time
- ✅ Easy to implement

**Use for**:
- Gold prices (cache 5 minutes)
- Market indices (cache 1 minute)
- PE chart data (cache 30 minutes)

#### B. Response Caching Headers
```python
@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/api/market/'):
        response.cache_control.max_age = 300  # 5 minutes
```

**Benefits**:
- ✅ Browser caching
- ✅ Reduced server load
- ✅ Faster subsequent requests

---

### 2. **Response Compression** 🟡

#### Gzip Compression
```python
from flask_compress import Compress
Compress(app)
```

**Impact**:
- PE Chart: 256KB → ~30KB (8x reduction)
- Faster transfer over network
- Lower bandwidth costs

**Estimated improvement**:
- PE Chart: 504ms → ~200ms (60% faster)

---

### 3. **Database Optimization** 🟡

#### A. Add Indexes
```sql
CREATE INDEX idx_stock_overview_symbol ON stock_overview(symbol);
CREATE INDEX idx_financial_statements_symbol_type ON financial_statements(symbol, report_type);
```

#### B. Query Optimization
```python
# Before: Multiple queries
for symbol in symbols:
    data = db.execute("SELECT * FROM stock_overview WHERE symbol=?", symbol)

# After: Single batch query  
symbols_str = ','.join(['?'] * len(symbols))
data = db.execute(f"SELECT * FROM stock_overview WHERE symbol IN ({symbols_str})", symbols)
```

**Impact**: 
- PE Chart query: 504ms → ~150ms (70% faster)

---

### 4. **Async/Parallel Processing** 🟡

#### External API Calls
```python
import asyncio
import aiohttp

async def fetch_gold_prices():
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.json()
```

**Impact**:
- Multiple external calls in parallel
- Gold API: 1206ms → ~400ms (67% faster)

---

### 5. **Connection Pooling** 🟢

#### SQLite Connection Pool
```python
from sqlalchemy import create_engine, pool

engine = create_engine(
    'sqlite:///stocks.db',
    poolclass=pool.QueuePool,
    pool_size=10,
    max_overflow=20
)
```

**Benefits**:
- Reduce connection overhead
- Better concurrency handling
- 10-20% faster queries

---

### 6. **Data Pre-computation** 🟢

#### Market Overview Pre-calculation
```python
# Cron job every 30 minutes
def precompute_market_overview():
    data = calculate_market_stats()
    cache['market_overview'] = data
    db.execute("UPDATE market_cache SET data=?", json.dumps(data))
```

**Impact**:
- Market endpoints: Real-time → Pre-computed
- Response time: 228ms → ~10ms (95% faster)

---

## 📈 Expected Results

### After All Optimizations

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| **Gold API** | 1206ms | 50ms | 🚀 96% faster |
| **PE Chart** | 504ms | 80ms | 🚀 84% faster |
| **Market Indices** | 228ms | 15ms | 🚀 93% faster |
| **Stock Data** | 10ms | 8ms | ⚡ 20% faster |
| **Overall Avg** | 281ms | **30ms** | **🚀 89% faster** |

---

## 🔧 Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
- [x] Add in-memory caching for gold prices
- [x] Add response compression (gzip)
- [x] Add cache headers
- [ ] Optimize PE chart query

**Expected**: 281ms → 150ms (46% improvement)

### Phase 2: Database (2-3 hours)
- [ ] Add database indexes
- [ ] Optimize queries (batch operations)
- [ ] Add connection pooling

**Expected**: 150ms → 80ms (47% improvement)

### Phase 3: Advanced (3-4 hours)
- [ ] Implement async external calls
- [ ] Add data pre-computation
- [ ] Set up background workers

**Expected**: 80ms → 30ms (62% improvement)

---

## 🛠️ Code Changes Required

### 1. Update backend/server.py
```python
from flask_compress import Compress
from functools import lru_cache
import time

# Enable compression
Compress(app)

# Simple cache
_cache = {}

def get_cached(key, ttl=300):
    if key in _cache:
        data, expires = _cache[key]
        if time.time() < expires:
            return data
    return None

def set_cache(key, data, ttl=300):
    _cache[key] = (data, time.time() + ttl)
```

### 2. Update routes/market.py
```python
@market_bp.route('/gold')
def get_gold():
    cached = get_cached('gold_prices')
    if cached:
        return jsonify(cached)
    
    # Fetch fresh data
    data = fetch_gold_from_external()
    set_cache('gold_prices', data, ttl=300)  # 5 minutes
    return jsonify(data)
```

### 3. Add database indexes
```sql
-- scripts/optimize_db.sql
CREATE INDEX IF NOT EXISTS idx_symbol ON stock_overview(symbol);
CREATE INDEX IF NOT EXISTS idx_financial_lookup ON financial_statements(symbol, report_type, period_type);
CREATE INDEX IF NOT EXISTS idx_updated_at ON stock_overview(updated_at);
```

---

## 📊 Monitoring & Metrics

### Add Performance Tracking
```python
import time
from functools import wraps

def track_performance(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        start = time.time()
        result = f(*args, **kwargs)
        elapsed = (time.time() - start) * 1000
        
        # Log slow queries
        if elapsed > 100:
            logger.warning(f"{f.__name__} took {elapsed:.2f}ms")
        
        return result
    return decorated_function
```

---

## 🎯 Success Metrics

### KPIs to Track
- ✅ Average response time < 50ms
- ✅ 95th percentile < 100ms
- ✅ 99th percentile < 200ms
- ✅ Cache hit rate > 80%
- ✅ Database query time < 10ms

### Tools
- Custom performance tracking
- Gunicorn access logs analysis
- SQLite query profiling

---

## 🚀 Next Steps

1. **Immediate** (Today)
   - Implement caching for gold prices
   - Add gzip compression
   - Test and measure improvement

2. **Short-term** (This week)
   - Add database indexes
   - Optimize queries
   - Deploy to VPS

3. **Long-term** (Next month)
   - Consider Redis for distributed cache
   - Implement CDN for static assets
   - Set up load balancing

---

**Status**: 📝 Planning Complete → Ready for Implementation  
**Estimated Total Time**: 6-9 hours  
**Expected Overall Improvement**: 89% faster (281ms → 30ms)
