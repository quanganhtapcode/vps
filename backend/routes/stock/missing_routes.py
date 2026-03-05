"""
Missing routes that frontend stockApi.ts expects but backend never exposed.

Endpoints added:
  GET  /api/companies                          – list all companies (paginated)
  GET  /api/companies/search?q=&limit=         – full-text search by ticker / name
  GET  /api/companies/industry/<industry>      – list stocks in an industry
  GET  /api/financial-report/<symbol>          – income / balance / cashflow / ratio
  GET  /api/batch-overview?symbols=            – stock overview for multiple tickers
  GET  /api/db/stats                           – database statistics
  GET  /api/stock/<symbol>/freshness           – data-freshness for a symbol
  GET/POST /api/valuation/<symbol>/sensitivity – 9×9 DCF sensitivity matrix
"""

from __future__ import annotations

import logging
import os
import sqlite3
import time as _time
from datetime import datetime

from flask import Blueprint, jsonify, request

from backend.db_path import resolve_stocks_db_path
from backend.extensions import get_provider, get_stock_service, get_financial_service
from backend.utils import validate_stock_symbol

logger = logging.getLogger(__name__)

# Simple in-memory cache (reuse pattern from stock_routes)
_cache: dict = {}
_CACHE_TTL = 600  # 10 min


def _cache_get(key):
    entry = _cache.get(key)
    if entry and (_time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key, data):
    _cache[key] = (_time.time(), data)
    if len(_cache) > 300:
        cutoff = _time.time() - _CACHE_TTL
        for k in [k for k, (t, _) in list(_cache.items()) if t < cutoff]:
            _cache.pop(k, None)


def register(stock_bp: Blueprint) -> None:

    # ------------------------------------------------------------------ #
    # GET /api/companies                                                    #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/companies")
    def api_companies():
        """Return all companies, optionally filtered by exchange."""
        exchange = request.args.get("exchange", "").upper()
        page = max(1, int(request.args.get("page", 1)))
        limit = min(500, max(10, int(request.args.get("limit", 200))))

        cache_key = f"companies_{exchange}_{page}_{limit}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        db_path = resolve_stocks_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # Detect schema
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='stocks'")
            has_stocks = cur.fetchone() is not None

            if has_stocks:
                q = """
                    SELECT s.ticker AS symbol, s.organ_name AS name,
                           se.exchange AS exchange, si.icb_name3 AS industry
                    FROM stocks s
                    LEFT JOIN stock_exchange se ON s.ticker = se.ticker
                    LEFT JOIN stock_industry si ON s.ticker = si.ticker
                """
                params: list = []
                if exchange:
                    q += " WHERE se.exchange = ?"
                    params.append(exchange)
                q += " ORDER BY s.ticker LIMIT ? OFFSET ?"
                params += [limit, (page - 1) * limit]
            else:
                q = "SELECT symbol, name, exchange, industry FROM company"
                params = []
                if exchange:
                    q += " WHERE exchange = ?"
                    params.append(exchange)
                q += " ORDER BY symbol LIMIT ? OFFSET ?"
                params += [limit, (page - 1) * limit]

            cur.execute(q, params)
            rows = cur.fetchall()
            conn.close()

            result = [dict(r) for r in rows]
            _cache_set(cache_key, result)
            return jsonify(result)
        except Exception as exc:
            logger.error(f"GET /companies error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # GET /api/companies/search                                             #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/companies/search")
    def api_companies_search():
        """Search companies by ticker or name."""
        q = request.args.get("q", "").strip()
        limit = min(50, max(1, int(request.args.get("limit", 20))))
        if not q:
            return jsonify([])

        cache_key = f"co_search_{q.lower()}_{limit}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        try:
            stock_service = get_stock_service()
            results = stock_service.search_stocks(q, limit)
            _cache_set(cache_key, results)
            return jsonify(results)
        except Exception as exc:
            logger.error(f"GET /companies/search error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # GET /api/companies/industry/<industry>                                #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/companies/industry/<path:industry>")
    def api_companies_by_industry(industry: str):
        """Return stocks belonging to an industry (ICB level-3 or level-4)."""
        cache_key = f"co_industry_{industry.lower()}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        db_path = resolve_stocks_db_path()
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # Try icb_name3 first, fall back to icb_name4
            cur.execute(
                """
                SELECT s.ticker AS symbol, s.organ_name AS name,
                       se.exchange AS exchange,
                       si.icb_name3 AS industry3, si.icb_name4 AS industry4
                FROM stocks s
                LEFT JOIN stock_exchange se ON s.ticker = se.ticker
                LEFT JOIN stock_industry si ON s.ticker = si.ticker
                WHERE si.icb_name3 = ? OR si.icb_name4 = ?
                ORDER BY s.ticker
                """,
                (industry, industry),
            )
            rows = cur.fetchall()
            conn.close()

            result = [
                {
                    "symbol": r["symbol"],
                    "name": r["name"],
                    "exchange": r["exchange"],
                    "industry": r["industry3"] or r["industry4"],
                }
                for r in rows
            ]
            _cache_set(cache_key, result)
            return jsonify(result)
        except Exception as exc:
            logger.error(f"GET /companies/industry error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # GET /api/financial-report/<symbol>                                    #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/financial-report/<symbol>")
    def api_financial_report(symbol: str):
        """
        Return financial statements for a symbol.
        Query params:
          type   = income | balance | cashflow | ratio  (default: income)
          period = quarter | year                       (default: quarter)
          limit  = number of periods                    (default: 8)
        """
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({"error": clean_symbol}), 400

        report_type = request.args.get("type", "income").lower()
        period = request.args.get("period", "quarter").lower()
        limit = min(20, max(1, int(request.args.get("limit", 8))))

        cache_key = f"fin_report_{clean_symbol}_{report_type}_{period}_{limit}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        db_path = resolve_stocks_db_path()
        if not db_path or not os.path.exists(db_path):
            return jsonify({"error": "Database not found"}), 503

        table_map = {
            "income": "income_statement",
            "balance": "balance_sheet",
            "cashflow": "cash_flow_statement",
            "ratio": "financial_ratios",
        }
        table = table_map.get(report_type)
        if not table:
            return jsonify({"error": f"Unknown report type '{report_type}'"}), 400

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            # Check table exists
            exists = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ).fetchone()
            if not exists:
                conn.close()
                return jsonify([])

            if period == "year":
                period_filter = "(quarter IS NULL OR quarter = 0)"
            else:
                period_filter = "quarter IN (1,2,3,4)"

            rows = conn.execute(
                f"""
                SELECT * FROM {table}
                WHERE symbol = ? AND {period_filter}
                ORDER BY year DESC, quarter DESC
                LIMIT ?
                """,
                (clean_symbol, limit),
            ).fetchall()
            conn.close()

            data = [dict(r) for r in rows]
            _cache_set(cache_key, data)
            return jsonify(data)
        except Exception as exc:
            logger.error(f"GET /financial-report/{clean_symbol} error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # GET /api/batch-overview                                               #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/batch-overview")
    def api_batch_overview():
        """
        Return stock overview for multiple symbols at once.
        Query param: symbols=VCB,HPG,VNM (comma-separated, max 20)
        """
        symbols_param = request.args.get("symbols", "")
        if not symbols_param:
            return jsonify({"error": "Missing 'symbols' parameter"}), 400

        symbols = [s.strip().upper() for s in symbols_param.split(",") if s.strip()][:20]

        cache_key = f"batch_overview_{'_'.join(sorted(symbols))}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        provider = get_provider()
        result: dict = {}
        for sym in symbols:
            try:
                data = provider.get_stock_data(sym, period="year")
                if data and data.get("success"):
                    result[sym] = data
                else:
                    result[sym] = {"symbol": sym, "success": False}
            except Exception as exc:
                logger.warning(f"batch-overview error for {sym}: {exc}")
                result[sym] = {"symbol": sym, "success": False, "error": str(exc)}

        _cache_set(cache_key, result)
        return jsonify(result)

    # ------------------------------------------------------------------ #
    # GET /api/db/stats                                                     #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/db/stats")
    def api_db_stats():
        """Return high-level statistics about the local SQLite database."""
        cache_key = "db_stats"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        db_path = resolve_stocks_db_path()
        if not db_path or not os.path.exists(db_path):
            return jsonify({"error": "Database not found"}), 503

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            stats: dict = {"db_path": os.path.basename(db_path)}

            # File size
            stats["db_size_mb"] = round(os.path.getsize(db_path) / 1_048_576, 2)

            # Table row-counts for key tables
            for tbl in (
                "stocks",
                "financial_ratios",
                "income_statement",
                "balance_sheet",
                "cash_flow_statement",
                "overview",
                "news",
            ):
                try:
                    cur.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tbl,)
                    )
                    if cur.fetchone():
                        cnt = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
                        stats[f"{tbl}_count"] = cnt
                except Exception:
                    pass

            # Distinct symbols with financial data
            try:
                cur.execute(
                    "SELECT COUNT(DISTINCT symbol) FROM financial_ratios"
                )
                row = cur.fetchone()
                stats["symbols_with_ratios"] = row[0] if row else 0
            except Exception:
                pass

            # Latest update timestamp
            try:
                row = cur.execute(
                    "SELECT MAX(updated_at) FROM stocks"
                ).fetchone()
                stats["latest_stock_update"] = row[0] if row else None
            except Exception:
                pass

            conn.close()
            stats["generated_at"] = datetime.utcnow().isoformat() + "Z"
            _cache_set(cache_key, stats)
            return jsonify(stats)
        except Exception as exc:
            logger.error(f"GET /db/stats error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # GET /api/stock/<symbol>/freshness                                     #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/stock/<symbol>/freshness")
    def api_stock_freshness(symbol: str):
        """
        Return data-freshness metadata for a symbol:
        when was price / financial data / news last updated in the local DB.
        """
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({"error": clean_symbol}), 400

        db_path = resolve_stocks_db_path()
        if not db_path or not os.path.exists(db_path):
            return jsonify({"symbol": clean_symbol, "fresh": False, "error": "DB not found"}), 503

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            freshness: dict = {"symbol": clean_symbol}

            # Stock record update
            try:
                row = cur.execute(
                    "SELECT updated_at FROM stocks WHERE ticker = ? LIMIT 1",
                    (clean_symbol,),
                ).fetchone()
                freshness["stock_updated_at"] = row["updated_at"] if row else None
            except Exception:
                pass

            # Latest financial ratio year/quarter
            try:
                row = cur.execute(
                    """
                    SELECT year, quarter, updated_at
                    FROM financial_ratios
                    WHERE symbol = ?
                    ORDER BY year DESC, quarter DESC NULLS LAST
                    LIMIT 1
                    """,
                    (clean_symbol,),
                ).fetchone()
                if row:
                    freshness["ratios_year"] = row["year"]
                    freshness["ratios_quarter"] = row["quarter"]
                    freshness["ratios_updated_at"] = row["updated_at"]
            except Exception:
                pass

            # Latest income statement
            try:
                row = cur.execute(
                    """
                    SELECT year, quarter, updated_at
                    FROM income_statement
                    WHERE symbol = ?
                    ORDER BY year DESC, quarter DESC NULLS LAST
                    LIMIT 1
                    """,
                    (clean_symbol,),
                ).fetchone()
                if row:
                    freshness["income_year"] = row["year"]
                    freshness["income_quarter"] = row["quarter"]
                    freshness["income_updated_at"] = row["updated_at"]
            except Exception:
                pass

            # Latest news
            try:
                row = cur.execute(
                    """
                    SELECT MAX(published_at) as latest
                    FROM news
                    WHERE symbol = ?
                    """,
                    (clean_symbol,),
                ).fetchone()
                freshness["news_latest_at"] = row["latest"] if row else None
            except Exception:
                pass

            conn.close()
            freshness["checked_at"] = datetime.utcnow().isoformat() + "Z"
            return jsonify(freshness)
        except Exception as exc:
            logger.error(f"GET /stock/{clean_symbol}/freshness error: {exc}")
            return jsonify({"error": str(exc)}), 500

    # ------------------------------------------------------------------ #
    # POST /api/valuation/<symbol>/sensitivity                              #
    # ------------------------------------------------------------------ #
    @stock_bp.route("/valuation/<symbol>/sensitivity", methods=["GET", "POST"])
    def api_valuation_sensitivity(symbol: str):
        """
        Return a sensitivity matrix for DCF valuation.

        Rows    → Required Return / WACC:  base-4% … base+4%  (step 1 pt)
        Columns → EPS/Revenue Growth:      base-4% … base+4%  (step 1 pt)
        Cell    → Intrinsic Value estimate (Gordon Growth Model simplified)

        POST body (all optional, falls back to sensible defaults):
          { "baseWacc": 10.5, "baseGrowth": 8, "terminalGrowth": 3,
            "currentPrice": 50000, "modelWeights": {...} }
        """
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({"error": clean_symbol}), 400

        body: dict = {}
        if request.method == "POST":
            body = request.get_json(silent=True) or {}

        def _f(val, default: float) -> float:
            try:
                v = float(val)
                return v if v == v else default  # NaN check
            except Exception:
                return default

        base_wacc = _f(body.get("baseWacc"), 10.5)
        base_growth = _f(body.get("baseGrowth"), 8.0)
        terminal_growth = _f(body.get("terminalGrowth"), 3.0)

        # Fetch EPS from DB
        eps = 0.0
        try:
            provider = get_provider()
            stock_data = provider.get_stock_data(clean_symbol, period="year")
            eps = _f(stock_data.get("eps_ttm") or stock_data.get("eps") or
                     stock_data.get("earnings_per_share"), 0.0)
        except Exception as exc:
            logger.warning(f"sensitivity: could not load stock data for {clean_symbol}: {exc}")

        if eps <= 0:
            return jsonify({
                "success": False,
                "error": "EPS không khả dụng – không thể tính độ nhạy DCF",
                "symbol": clean_symbol,
            }), 422

        projection_years = int(body.get("projectionYears") or 5)

        # Build the wacc and growth axes (±4 percentage-points, step 1)
        waccs = [round(base_wacc + delta, 1) for delta in range(-4, 5)]   # 9 points
        growths = [round(base_growth + delta, 1) for delta in range(-4, 5)]  # 9 points

        def _dcf(eps_val: float, g_pct: float, r_pct: float, t_pct: float, years: int) -> float:
            """Simple 2-stage DCF per share using EPS as proxy for FCFE."""
            g = g_pct / 100
            r = r_pct / 100
            t = t_pct / 100
            if r <= g:
                return 0.0
            pv = 0.0
            cf = eps_val
            for yr in range(1, years + 1):
                cf *= (1 + g)
                pv += cf / (1 + r) ** yr
            # Terminal value (Gordon Growth)
            if r > t:
                terminal = (cf * (1 + t)) / (r - t)
                pv += terminal / (1 + r) ** years
            return round(pv, 2)

        matrix: list[list] = []
        for g in growths:
            row: list = []
            for w in waccs:
                val = _dcf(eps, g, w, terminal_growth, projection_years)
                row.append(val)
            matrix.append(row)

        return jsonify({
            "success": True,
            "symbol": clean_symbol,
            "eps_used": eps,
            "base_wacc": base_wacc,
            "base_growth": base_growth,
            "terminal_growth": terminal_growth,
            "projection_years": projection_years,
            "wacc_axis": waccs,       # column headers
            "growth_axis": growths,   # row headers
            "matrix": matrix,         # matrix[growth_idx][wacc_idx]
        })
