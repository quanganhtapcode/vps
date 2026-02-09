# API Documentation

Complete API reference for Vietnam Stock Valuation Platform

**Base URL**: `http://api.quanganh.org` (Production) or `http://localhost:8000` (Development)

---

## Table of Contents

- [Authentication](#authentication)
- [Stock APIs](#stock-apis)
- [Market APIs](#market-apis)
- [Health Check](#health-check)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Response Format](#response-format)

---

## Authentication

Currently, the API is **publicly accessible** without authentication. Rate limiting applies to prevent abuse.

**Planned**: API key authentication for premium features (Q1 2026)

---

## Stock APIs

### Get Stock Data

```http
GET /api/stock/<symbol>
```

Get comprehensive stock data for a specific symbol.

**Parameters:**
- `symbol` (path param, required): Stock symbol (e.g., VCB, HPG, VNM)

**Example Request:**
```bash
curl http://api.quanganh.org/v1/valuation/stock/VCB
```

**Success Response (200 OK):**
```json
{
  "symbol": "VCB",
  "name": "Ngân hàng TMCP Ngoại Thương Việt Nam",
  "exchange": "HOSE",
  "industry": "Ngân hàng",
  
  "valuation_metrics": {
    "pe": 12.5,
    "pb": 2.3,
    "ps": 1.8,
    "ev_ebitda": 8.5
  },
  
  "per_share_metrics": {
    "eps_ttm": 8500,
    "bvps": 41000,
    "revenue_per_share": 65000
  },
  
  "profitability": {
    "roe": 18.5,
    "roa": 1.2,
    "net_profit_margin": 32.5,
    "gross_margin": 45.2
  },
  
  "financials_ttm": {
    "revenue": 45000000000000,
    "net_income": 15000000000000,
    "total_assets": 1250000000000000,
    "total_equity": 120000000000000,
    "total_debt": 850000000000000
  },
  
  "market_data": {
    "market_cap": 180000000000000,
    "current_price": 95000,
    "volume": 2500000
  },
  
  "updated_at": "2025-01-15T10:30:00"
}
```

**Error Responses:**

```json
// 404 Not Found - Stock not found
{
  "error": "Stock not found",
  "symbol": "INVALID"
}

// 500 Internal Server Error - Database error
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

### Get Stock Financial Statements

```http
GET /api/stock/<symbol>/financials
```

Get historical financial statements (income, balance, cashflow, ratio).

**Parameters:**
- `symbol` (path param, required): Stock symbol
- `report_type` (query param, optional): `income`, `balance`, `cashflow`, `ratio` (default: all)
- `period_type` (query param, optional): `quarter`, `year` (default: both)
- `limit` (query param, optional): Number of periods to return (default: 8)

**Example Request:**
```bash
curl "http://api.quanganh.org/v1/valuation/stock/VCB/financials?report_type=income&period_type=quarter&limit=4"
```

**Success Response (200 OK):**
```json
{
  "symbol": "VCB",
  "financials": [
    {
      "report_type": "income",
      "period_type": "quarter",
      "year": 2024,
      "quarter": 4,
      "data": {
        "revenue": 12000000000000,
        "net_income": 4000000000000,
        "operating_income": 5000000000000,
        "ebitda": 6000000000000
      },
      "updated_at": "2025-01-10T08:00:00"
    },
    {
      "report_type": "income",
      "period_type": "quarter",
      "year": 2024,
      "quarter": 3,
      "data": {...}
    }
  ],
  "count": 4
}
```

---

## Market APIs

### Get PE Chart Data

```http
GET /api/market/pe-chart
```

Get PE ratios and market cap for all stocks (1500+).

**Query Parameters:**
- `exchange` (optional): Filter by exchange (`HOSE`, `HNX`, `UPCOM`)
- `industry` (optional): Filter by industry
- `min_pe` (optional): Minimum PE ratio
- `max_pe` (optional): Maximum PE ratio
- `min_market_cap` (optional): Minimum market cap (in billions)
- `sort_by` (optional): Sort field (`pe`, `market_cap`, `symbol`)
- `order` (optional): Sort order (`asc`, `desc`)
- `limit` (optional): Number of results (default: 1000)

**Example Request:**
```bash
curl "http://api.quanganh.org/v1/valuation/market/pe-chart?exchange=HOSE&max_pe=15&sort_by=market_cap&order=desc&limit=50"
```

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "symbol": "VCB",
      "pe": 12.5,
      "pb": 2.3,
      "market_cap": 180000000,
      "industry": "Ngân hàng",
      "exchange": "HOSE",
      "current_price": 95000
    },
    {
      "symbol": "HPG",
      "pe": 8.2,
      "pb": 1.1,
      "market_cap": 95000000,
      "industry": "Thép",
      "exchange": "HOSE",
      "current_price": 28500
    }
  ],
  "count": 50,
  "total": 1556,
  "cached": true,
  "cache_hit_rate": 0.85,
  "timestamp": "2025-01-15T10:30:00"
}
```

**Performance:**
- **Without cache**: ~500ms
- **With cache**: ~80ms
- **Cache TTL**: 5 minutes

---

### Get Market Indices

```http
GET /api/market/indices
```

Get real-time market indices (VN-Index, HNX-Index, UPCOM-Index).

**Example Request:**
```bash
curl http://api.quanganh.org/v1/valuation/market/indices
```

**Success Response (200 OK):**
```json
{
  "vnindex": {
    "value": 1250.5,
    "change": 15.2,
    "percent_change": 1.23,
    "open": 1235.3,
    "high": 1255.8,
    "low": 1232.1,
    "volume": 850000000,
    "value_traded": 22500000000000,
    "timestamp": "2025-01-15T15:00:00"
  },
  "hnxindex": {
    "value": 235.8,
    "change": 2.5,
    "percent_change": 1.07,
    "open": 233.3,
    "high": 236.5,
    "low": 232.8,
    "volume": 120000000,
    "value_traded": 3500000000000,
    "timestamp": "2025-01-15T15:00:00"
  },
  "upcom": {
    "value": 88.5,
    "change": 0.8,
    "percent_change": 0.91,
    "open": 87.7,
    "high": 88.9,
    "low": 87.5,
    "volume": 45000000,
    "value_traded": 1200000000000,
    "timestamp": "2025-01-15T15:00:00"
  },
  "cached": true,
  "timestamp": "2025-01-15T15:00:00"
}
```

**Performance:**
- **Without cache**: ~228ms
- **With cache**: ~15ms
- **Cache TTL**: 1 minute (during trading hours), 5 minutes (after hours)

---

### Get Gold Prices

```http
GET /api/market/gold
```

Get real-time gold prices from major dealers (SJC, PNJ, DOJI, etc.).

**Example Request:**
```bash
curl http://api.quanganh.org/v1/valuation/market/gold
```

**Success Response (200 OK):**
```json
{
  "sjc": {
    "name": "Vàng SJC",
    "buy": 77500000,
    "sell": 78200000,
    "change": 200000,
    "percent_change": 0.26,
    "unit": "VND/lượng",
    "timestamp": "2025-01-15T15:30:00"
  },
  "pnj": {
    "name": "Vàng PNJ",
    "buy": 77400000,
    "sell": 78100000,
    "change": 150000,
    "percent_change": 0.19,
    "unit": "VND/lượng",
    "timestamp": "2025-01-15T15:30:00"
  },
  "doji": {
    "name": "Vàng DOJI",
    "buy": 77450000,
    "sell": 78150000,
    "change": 180000,
    "percent_change": 0.23,
    "unit": "VND/lượng",
    "timestamp": "2025-01-15T15:30:00"
  },
  "cached": true,
  "timestamp": "2025-01-15T15:30:00"
}
```

**Performance:**
- **Without cache**: ~1206ms (fetches from external sources)
- **With cache**: ~50ms
- **Cache TTL**: 5 minutes

---

### Get Market Overview

```http
GET /api/market/overview
```

Get comprehensive market overview (indices, top gainers/losers, most active).

**Example Request:**
```bash
curl http://api.quanganh.org/v1/valuation/market/overview
```

**Success Response (200 OK):**
```json
{
  "indices": {
    "vnindex": {...},
    "hnxindex": {...},
    "upcom": {...}
  },
  "top_gainers": [
    {
      "symbol": "HPG",
      "name": "Tập đoàn Hòa Phát",
      "price": 28500,
      "change": 2600,
      "percent_change": 10.03,
      "volume": 15000000
    }
  ],
  "top_losers": [
    {
      "symbol": "VNM",
      "name": "Vinamilk",
      "price": 68000,
      "change": -6200,
      "percent_change": -8.36,
      "volume": 3500000
    }
  ],
  "most_active": [
    {
      "symbol": "VCB",
      "name": "Vietcombank",
      "price": 95000,
      "change": 1200,
      "percent_change": 1.28,
      "volume": 25000000,
      "value_traded": 2375000000000
    }
  ],
  "market_stats": {
    "total_volume": 850000000,
    "total_value": 22500000000000,
    "advancing": 285,
    "declining": 198,
    "unchanged": 73
  },
  "timestamp": "2025-01-15T15:00:00"
}
```

---

## Health Check

### Health Status

```http
GET /health
```

Check API health status.

**Example Request:**
```bash
curl http://api.quanganh.org/health
```

**Success Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "cache": {
    "enabled": true,
    "hit_rate": 0.85,
    "size": 1024
  },
  "version": "1.0.0",
  "uptime": "5d 12h 35m",
  "timestamp": "2025-01-15T10:30:00"
}
```

**Performance:** ~8ms

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Error title",
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-01-15T10:30:00"
}
```

### Error Codes

| HTTP Status | Error Code | Description |
|------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Invalid request parameters |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Database or cache unavailable |

**Example Error Response:**

```json
{
  "error": "Stock not found",
  "message": "Stock with symbol 'INVALID' does not exist",
  "code": "NOT_FOUND",
  "timestamp": "2025-01-15T10:30:00"
}
```

---

## Rate Limiting

**Current Limits:**
- **Public API**: No rate limiting (monitored for abuse)
- **Data Fetching**: 120 requests/minute (dual API key rotation)

**Planned (Q1 2026):**
- **Free Tier**: 100 requests/minute
- **Premium Tier**: 1000 requests/minute
- **Enterprise**: Unlimited

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642262400
```

---

## Response Format

### Success Response

```json
{
  "data": {...},
  "timestamp": "2025-01-15T10:30:00",
  "cached": true
}
```

### Error Response

```json
{
  "error": "Error title",
  "message": "Detailed message",
  "code": "ERROR_CODE",
  "timestamp": "2025-01-15T10:30:00"
}
```

### Pagination (for list endpoints)

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_pages": 20,
    "total_count": 1000
  },
  "timestamp": "2025-01-15T10:30:00"
}
```

---

## Performance Metrics

### Average Response Times

| Endpoint | Without Cache | With Cache | Improvement |
|----------|--------------|------------|-------------|
| `/health` | 8ms | 8ms | - |
| `/api/stock/<symbol>` | 10ms | 8ms | 20% |
| `/api/market/pe-chart` | 504ms | 80ms | 84% |
| `/api/market/indices` | 228ms | 15ms | 93% |
| `/api/market/gold` | 1206ms | 50ms | 96% |

### Cache Hit Rates

- **Stock Data**: 75-80%
- **Market Data**: 85-90%
- **Gold Prices**: 90-95%

### Database Query Performance

- **Indexed queries**: < 10ms
- **Full table scans**: < 50ms
- **Complex joins**: < 100ms

---

## Examples

### Python

```python
import requests

# Get stock data
response = requests.get('http://api.quanganh.org/v1/valuation/stock/VCB')
data = response.json()
print(f"VCB PE: {data['valuation_metrics']['pe']}")

# Get PE chart
response = requests.get('http://api.quanganh.org/v1/valuation/market/pe-chart', params={
    'exchange': 'HOSE',
    'max_pe': 15,
    'limit': 50
})
stocks = response.json()['data']
for stock in stocks:
    print(f"{stock['symbol']}: PE={stock['pe']}, Cap={stock['market_cap']}B")
```

### JavaScript

```javascript
// Get stock data
fetch('http://api.quanganh.org/v1/valuation/stock/VCB')
  .then(res => res.json())
  .then(data => {
    console.log(`VCB PE: ${data.valuation_metrics.pe}`);
  });

// Get market indices
fetch('http://api.quanganh.org/v1/valuation/market/indices')
  .then(res => res.json())
  .then(data => {
    console.log(`VN-Index: ${data.vnindex.value} (${data.vnindex.percent_change}%)`);
  });
```

### cURL

```bash
# Get stock data
curl http://api.quanganh.org/api/stock/VCB

# Get PE chart with filters
curl "http://api.quanganh.org/api/market/pe-chart?exchange=HOSE&max_pe=15&limit=50"

# Get market indices
curl http://api.quanganh.org/api/market/indices

# Get gold prices
curl http://api.quanganh.org/api/market/gold

# Health check
curl http://api.quanganh.org/health
```

---

## Updates & Changes

### Version 1.0.0 (Current)
- Initial API release
- 7 production endpoints
- TTL caching implemented
- Database optimization complete
- Average response time: ~30ms (89% faster than baseline)

### Planned Updates
- **v1.1.0** (Q1 2026): Authentication & rate limiting
- **v1.2.0** (Q2 2026): WebSocket support for real-time data
- **v2.0.0** (Q3 2026): GraphQL API, advanced filtering

---

## Support

- **Documentation**: [GitHub README](../README.md)
- **Performance Report**: [API_PERFORMANCE_REPORT.md](API_PERFORMANCE_REPORT.md)
- **Optimization Plan**: [OPTIMIZATION_PLAN.md](OPTIMIZATION_PLAN.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/vietnam-stock-valuation/issues)

---

© 2025 Quang Anh. All rights reserved.
