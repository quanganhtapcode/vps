from flask import Blueprint, jsonify, request
import logging
import pandas as pd
import numpy as np
import sqlite3
from datetime import datetime, timedelta
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.extensions import get_provider, get_valuation_service
from backend.utils import validate_stock_symbol
from backend.db_path import resolve_stocks_db_path
from backend.services.source_priority import (
    SOURCE_PRIORITY_LABEL,
    apply_source_priority,
    get_screening_metrics,
)
from backend.routes.stock.financial_dashboard import register as register_financial_dashboard_routes
from backend.routes.stock.missing_routes import register as register_missing_routes
from vnstock import Vnstock, Quote, Company

stock_bp = Blueprint('stock', __name__)
logger = logging.getLogger(__name__)

# Register modular extra routes onto the active monolithic blueprint
register_financial_dashboard_routes(stock_bp)
register_missing_routes(stock_bp)

# ===================== IN-MEMORY CACHE =====================
import time as _time
_cache = {}  # key -> (timestamp, data)
_CACHE_TTL = 600  # 10 minutes

def _cache_get(key):
    entry = _cache.get(key)
    if entry and (_time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None

def _cache_set(key, data):
    _cache[key] = (_time.time(), data)
    # Evict old entries if cache grows too large (>500 entries)
    if len(_cache) > 500:
        cutoff = _time.time() - _CACHE_TTL
        keys_to_del = [k for k, (t, _) in _cache.items() if t < cutoff]
        for k in keys_to_del:
            del _cache[k]


def _holder_group(name: str) -> str:
    n = (name or '').strip().lower()
    if not n:
        return 'individual'

    institutional_keywords = [
        'công ty', 'ctcp', 'tnhh', 'ngân hàng', 'quỹ', 'bảo hiểm', 'chứng khoán',
        'fund', 'capital', 'asset management', 'bank', 'insurance', 'securities',
        'investment', 'investor', 'holdings', 'corp', 'corporation', 'inc', 'llc',
        'ltd', 'plc', 'group', 'partners', 'trust', 'etf',
    ]
    if any(k in n for k in institutional_keywords):
        return 'institutional'
    return 'individual'


def _compute_change_pct(current_qty: float, prev_qty: float | None) -> float | None:
    try:
        cur = float(current_qty or 0)
        prev = float(prev_qty) if prev_qty is not None else 0.0
        if prev <= 0:
            return None
        return float(((cur - prev) / prev) * 100.0)
    except Exception:
        return None


def _query_previous_quantity(
    conn: sqlite3.Connection,
    table: str,
    symbol: str,
    name_field: str,
    name_value: str,
    before_date: str,
    qty_field: str = 'quantity',
) -> float | None:
    try:
        row = conn.execute(
            f"""
            SELECT {qty_field} AS qty
            FROM {table}
            WHERE symbol = ?
              AND {name_field} = ?
              AND update_date < ?
            ORDER BY update_date DESC
            LIMIT 1
            """,
            (symbol, name_value, before_date),
        ).fetchone()
        if not row:
            return None
        return float(row['qty']) if row['qty'] is not None else None
    except Exception:
        return None


def _select_snapshot_date(
    conn: sqlite3.Connection,
    table: str,
    symbol: str,
    min_rows_for_complete: int,
    max_candidates: int = 12,
) -> tuple[str | None, str | None, int, int]:
    """Return best snapshot date for holders data.

    Strategy:
    - Inspect latest N snapshot dates by recency.
    - Prefer the newest date whose row count >= min_rows_for_complete.
    - Fall back to strict latest date if none meets threshold.
    """
    if table not in ('shareholders', 'officers'):
        return None, None, 0, 0

    try:
        rows = conn.execute(
            f"""
            SELECT update_date, COUNT(*) AS c
            FROM {table}
            WHERE symbol = ?
              AND update_date IS NOT NULL
            GROUP BY update_date
            ORDER BY update_date DESC
            LIMIT ?
            """,
            (symbol, max_candidates),
        ).fetchall() or []
        if not rows:
            return None, None, 0, 0

        latest_date = rows[0]['update_date']
        latest_count = int(rows[0]['c'] or 0)

        for row in rows:
            c = int(row['c'] or 0)
            if c >= int(min_rows_for_complete):
                return row['update_date'], latest_date, c, latest_count

        return latest_date, latest_date, latest_count, latest_count
    except Exception:
        return None, None, 0, 0


def _to_json_number(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        v = float(value)
        if np.isnan(v) or np.isinf(v):
            return default
        return v
    except Exception:
        return default


def _fetch_batch_price_symbol(provider, symbol: str) -> tuple[str, dict]:
    try:
        price_data = provider.get_current_price_with_change(symbol)

        cached_data = provider._stock_data_cache.get(symbol, {})
        company_name = cached_data.get('company_name') or cached_data.get('short_name') or symbol
        exchange = cached_data.get('exchange', 'HOSE')

        if price_data:
            current_price = price_data.get('current_price')
            change_percent = price_data.get('price_change_percent', 0)
        else:
            current_price = None
            change_percent = 0

        return symbol, {
            "price": current_price,
            "changePercent": change_percent,
            "companyName": company_name,
            "exchange": exchange,
        }
    except Exception as e:
        logger.warning(f"Error getting data for {symbol}: {e}")
        return symbol, {
            "price": None,
            "changePercent": 0,
            "companyName": symbol,
            "exchange": "HOSE",
        }


def _get_latest_financial_ratios_row(symbol: str, period: str) -> dict | None:
    """Read latest row from financial_ratios for the requested period.

    - quarter: latest Q1..Q4 row
    - year: latest annual row (quarter IS NULL)
    """
    db_path = resolve_stocks_db_path()
    if not db_path or not os.path.exists(db_path):
        return None

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_ratios'")
        if cur.fetchone() is None:
            return None

        symbol_u = symbol.upper()
        if period == 'year':
            cur.execute(
                """
                SELECT *
                FROM financial_ratios
                WHERE symbol = ?
                  AND quarter IS NULL
                ORDER BY year DESC
                LIMIT 1
                """,
                (symbol_u,),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM financial_ratios
                WHERE symbol = ?
                  AND quarter IN (1,2,3,4)
                ORDER BY year DESC, quarter DESC
                LIMIT 1
                """,
                (symbol_u,),
            )

        row = cur.fetchone()
        return dict(row) if row else None
    except Exception as exc:
        logger.warning(f"financial_ratios lookup failed for {symbol} {period}: {exc}")
        return None
    finally:
        if conn:
            conn.close()


def _enrich_with_financial_ratios(data: dict, symbol: str, period: str) -> dict:
    """Merge canonical metrics from financial_ratios into stock payload.

    This uses stored DB values only (no derived calculations).
    """
    row = _get_latest_financial_ratios_row(symbol=symbol, period=period)
    if not row:
        return data

    mapping = {
        'eps_vnd': ['eps', 'eps_ttm'],
        'price_to_earnings': ['pe', 'pe_ratio'],
        'price_to_book': ['pb', 'pb_ratio'],
        'price_to_sales': ['ps'],
        'price_to_cash_flow': ['p_cash_flow', 'pcf_ratio'],
        'ev_to_ebitda': ['ev_to_ebitda', 'ev_ebitda'],
        'debt_to_equity': ['debt_to_equity'],
        'debt_to_equity_adjusted': ['debt_to_equity_adjusted'],
        'current_ratio': ['current_ratio'],
        'quick_ratio': ['quick_ratio'],
        'cash_ratio': ['cash_ratio'],
        'interest_coverage_ratio': ['interest_coverage'],
        'financial_leverage': ['financial_leverage'],
        'asset_turnover': ['asset_turnover'],
        'inventory_turnover': ['inventory_turnover'],
        'gross_margin': ['gross_margin'],
        'ebit_margin': ['ebit_margin'],
        'net_profit_margin': ['net_profit_margin'],
        'roe': ['roe'],
        'roic': ['roic'],
        'roa': ['roa'],
        'beta': ['beta'],
        'bvps_vnd': ['bvps'],
    }

    for source_key, target_keys in mapping.items():
        value = row.get(source_key)
        if value is None:
            continue
        try:
            casted = float(value)
        except Exception:
            continue
        for target_key in target_keys:
            data[target_key] = casted

    # Keep period provenance for debugging/UI if needed.
    data['ratios_year'] = row.get('year')
    data['ratios_quarter'] = row.get('quarter')
    data['ratios_source_table'] = 'financial_ratios'

    return data

# ===================== CORE STOCK DATA =====================

@stock_bp.route("/current-price/<symbol>")
def api_current_price(symbol):
    """Get real-time current price for a symbol (dict format)"""
    return api_price(symbol) # Redirect logic to consolidated handler

@stock_bp.route("/price/<symbol>")
def api_price(symbol):
    """Get real-time price for a symbol (lightweight endpoint for auto-refresh)"""
    try:
        # Validate symbol
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({"success": False, "error": clean_symbol}), 400
        
        symbol = clean_symbol
        provider = get_provider()
        
        # Get shares outstanding for market cap
        cached_data = provider._stock_data_cache.get(symbol, {})
        shares = cached_data.get('shares_outstanding')
        
        # Use provider's optimized method
        price_data = provider.get_current_price_with_change(symbol)
        
        if price_data:
            current_price = price_data.get('current_price', 0)
            market_cap = current_price * shares if pd.notna(shares) and shares > 0 else None
            market_cap_source = 'shares_outstanding'

            if market_cap is None:
                screening = get_screening_metrics(symbol, cache_get=_cache_get, cache_set=_cache_set)
                if screening:
                    screening_cap = _to_json_number(screening.get('market_cap'))
                    if screening_cap > 0:
                        market_cap = screening_cap
                        market_cap_source = screening.get('source', 'unknown')
            
            return jsonify({
                "symbol": symbol,
                "current_price": current_price,
                "price_change": price_data.get('price_change'),
                "price_change_percent": price_data.get('price_change_percent'),
                "timestamp": datetime.now().isoformat(),
                "success": True,
                "source": price_data.get('source', 'VCI'),
                # Add full market data
                "open": price_data.get('open', 0),
                "high": price_data.get('high', 0),
                "low": price_data.get('low', 0),
                "volume": price_data.get('volume', 0),
                "ceiling": price_data.get('ceiling', 0),
                "floor": price_data.get('floor', 0),
                "ref_price": price_data.get('ref_price', 0),
                "market_cap": market_cap,
                "market_cap_source": market_cap_source,
                "shares_outstanding": shares,
                "source_priority": SOURCE_PRIORITY_LABEL,
            })
        
        return jsonify({
            "success": False, 
            "error": f"Could not fetch price for {symbol}",
            "symbol": symbol
        }), 404
        
    except Exception as exc:
        logger.error(f"API /price error {symbol}: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/stock/batch-price")
@stock_bp.route("/batch-price")  # alias – frontend calls /api/batch-price
def api_batch_price():
    """Get real-time prices for multiple symbols at once"""
    provider = get_provider()
    try:
        symbols_param = request.args.get('symbols', '')
        if not symbols_param:
            return jsonify({"error": "Missing 'symbols' parameter"}), 400
        
        symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
        if len(symbols) > 20:
            symbols = symbols[:20]
        
        workers = min(8, max(2, len(symbols)))
        mapped: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(_fetch_batch_price_symbol, provider, symbol) for symbol in symbols]
            for future in as_completed(futures):
                sym, payload = future.result()
                mapped[sym] = payload

        # Keep response order stable with request order.
        result = {
            sym: mapped.get(sym, {"price": None, "changePercent": 0, "companyName": sym, "exchange": "HOSE"})
            for sym in symbols
        }
        return jsonify(result)
    except Exception as exc:
        logger.error(f"API /stock/batch-price error: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/stock/<symbol>")
def api_stock(symbol):
    """Get stock summary data (financials, ratios)"""
    provider = get_provider()
    try:
        period = request.args.get("period", "year")
        fetch_price = request.args.get("fetch_price", "false").lower() == "true"
        data = provider.get_stock_data(symbol, period, fetch_current_price=fetch_price)
        
        def convert_nan_to_none(obj):
            if isinstance(obj, dict):
                return {k: convert_nan_to_none(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_nan_to_none(v) for v in obj]
            elif pd.isna(obj):
                return None
            else:
                return obj
                
        enriched_data = _enrich_with_financial_ratios(data=data, symbol=symbol, period=period)
        prioritized_data = apply_source_priority(
            enriched_data,
            symbol,
            cache_get=_cache_get,
            cache_set=_cache_set,
        )
        clean_data = convert_nan_to_none(prioritized_data)
        return jsonify(clean_data)
    except Exception as exc:
        logger.error(f"API /stock error {symbol}: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/app-data/<symbol>")
def api_app(symbol):
    """Get app-specific stock data (simplified for mobile/app usage)"""
    provider = get_provider()
    try:
        period = request.args.get("period", "year")
        fetch_price = request.args.get("fetch_price", "false").lower() == "true"
        data = provider.get_stock_data(symbol, period, fetch_current_price=fetch_price)
        data = apply_source_priority(
            data,
            symbol,
            cache_get=_cache_get,
            cache_set=_cache_set,
        )
        
        # Fallback logic for ROE/ROA if quarter data missing
        if data.get("success") and period == "quarter":
            yearly_data = provider.get_stock_data(symbol, "year")
            roe_quarter = data.get("roe")
            roa_quarter = data.get("roa")
            if pd.isna(roe_quarter): roe_quarter = yearly_data.get("roe")
            if pd.isna(roa_quarter): roa_quarter = yearly_data.get("roa")
            data["roe"] = roe_quarter
            data["roa"] = roa_quarter
            
        if data.get("success"):
            if pd.isna(data.get("earnings_per_share", np.nan)):
                data["earnings_per_share"] = data.get("eps_ttm", np.nan)
                
            def convert_nan_to_none(obj):
                if isinstance(obj, dict):
                    return {k: convert_nan_to_none(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_nan_to_none(v) for v in obj]
                elif pd.isna(obj):
                    return None
                else:
                    return obj
            return jsonify(convert_nan_to_none(data))
        else:
             return jsonify(data)   
    except Exception as exc:
        logger.error(f"API /app-data error {symbol}: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/historical-chart-data/<symbol>")
def api_historical_chart_data(symbol):
    """
    Get historical chart data for Financials Tab charts (ROE, ROA, PE, PB, etc.)
    """
    try:
        is_valid, result = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({"error": result}), 400
        symbol = result
        
        period = request.args.get('period', 'quarter') # 'quarter' or 'year'
        
        # Check cache first
        cache_key = f'hist_chart_{symbol}_{period}'
        cached = _cache_get(cache_key)
        if cached:
            logger.info(f"Cache HIT for historical-chart-data {symbol} {period}")
            return jsonify(cached)
        
        # Use Vnstock directly to get historical series
        stock = Vnstock().stock(symbol=symbol, source='VCI')
        df = stock.finance.ratio(period=period, lang='en', dropna=True)
        
        if df is None or df.empty:
            return jsonify({'success': False, 'message': 'No data'}), 404
            
        # Handle MultiIndex columns
        # Flatten logic or access by tuple
        
        # Sort chronologically: oldest to newest
        # Columns often include ('Meta', 'yearReport') and ('Meta', 'lengthReport')
        
        # Attempt to find year/quarter columns
        year_col = None
        period_col = None
        
        for col in df.columns:
            if isinstance(col, tuple):
                if 'yearReport' in str(col): year_col = col
                if 'lengthReport' in str(col): period_col = col
            else:
                if 'yearReport' in str(col): year_col = col
                if 'lengthReport' in str(col): period_col = col
                
        if not year_col:
            # Fallback for year only
            if period == 'year' and 'year' in df.columns: year_col = 'year'
            
        if year_col:
            if period_col:
                df = df.sort_values([year_col, period_col], ascending=[True, True])
            else:
                df = df.sort_values([year_col], ascending=[True])
        
        # Extract series
        years = []
        roe_data = []
        roa_data = []
        pe_ratio_data = []
        pb_ratio_data = []
        current_ratio_data = []
        quick_ratio_data = []
        cash_ratio_data = []
        nim_data = []
        
        def get_val(row, key_tuple):
            val = row.get(key_tuple)
            if pd.isna(val): return None
            try:
                return float(val)
            except: return None

        # Define keys based on vnstock output (verified in stock_provider)
        key_roe = ('Chỉ tiêu khả năng sinh lợi', 'ROE (%)')
        key_roa = ('Chỉ tiêu khả năng sinh lợi', 'ROA (%)')
        key_pe = ('Chỉ tiêu định giá', 'P/E')
        key_pb = ('Chỉ tiêu định giá', 'P/B')
        key_current = ('Chỉ tiêu thanh khoản', 'Current Ratio')
        key_quick = ('Chỉ tiêu thanh khoản', 'Quick Ratio')
        key_cash = ('Chỉ tiêu thanh khoản', 'Cash Ratio')
        key_nim = ('Chỉ tiêu khả năng sinh lợi', 'NIM (%)') # Bank specific
        
        # If columns are not MultiIndex tuples, try to match partial string
        is_multi = isinstance(df.columns, pd.MultiIndex)
        
        for _, row in df.iterrows():
            # Time axis
            y = row.get(year_col)
            p = row.get(period_col) if period_col else None
            
            label = str(y)
            if period == 'quarter' and p:
                label = f"Q{int(p)} '{str(y)[-2:]}"
            
            years.append(label)
            
            # Data points
            # Helper to find key in row
            def safe_get(k):
                if k in row: return get_val(row, k)
                # Fallback search
                k_str = str(k[-1]) if isinstance(k, tuple) else str(k)
                for col_key in row.index:
                    col_str = str(col_key)
                    if k_str in col_str:
                        return get_val(row, col_key)
                return None
                
            roe = safe_get(key_roe)
            if roe is not None and abs(roe) < 1: roe *= 100 # Adjust decimal to percent if needed (VCI usually %)
            roe_data.append(roe)
            
            roa = safe_get(key_roa)
            if roa is not None and abs(roa) < 1: roa *= 100
            roa_data.append(roa)
            
            pe_ratio_data.append(safe_get(key_pe))
            pb_ratio_data.append(safe_get(key_pb))
            current_ratio_data.append(safe_get(key_current))
            quick_ratio_data.append(safe_get(key_quick))
            cash_ratio_data.append(safe_get(key_cash))
            
            # NIM
            nim = safe_get(key_nim)
            if nim is not None and abs(nim) < 1: nim *= 100
            nim_data.append(nim)

        # Fallback NIM series from local DB when live coverage is missing/insufficient
        has_nim_values = any(v is not None and pd.notna(v) and float(v) != 0 for v in nim_data)
        live_nim_non_zero_count = sum(1 for v in nim_data if v is not None and pd.notna(v) and float(v) != 0)
        if period in ('quarter', 'year'):
            try:
                provider = get_provider()
                db_path = getattr(provider, 'db_path', None)

                if db_path and os.path.exists(db_path):
                    conn = sqlite3.connect(db_path)
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()

                    cursor.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name='ratio_wide'")
                    has_ratio_wide = cursor.fetchone() is not None

                    if has_ratio_wide:
                        if period == 'quarter':
                            cursor.execute(
                                """
                                SELECT year, quarter, nim, cof
                                FROM ratio_wide
                                WHERE symbol = ?
                                  AND period_type = 'quarter'
                                  AND nim IS NOT NULL
                                ORDER BY year ASC, quarter ASC
                                """,
                                (symbol,),
                            )
                            rows = cursor.fetchall()

                            if rows:
                                nim_by_label = {}
                                for r in rows:
                                    label = f"Q{int(r['quarter'])} '{str(r['year'])[-2:]}"
                                    nim_val = float(r['nim'])
                                    # KBS quarterly NIM is often non-annualized (~0.5-1.0), annualize for comparability
                                    if r['cof'] is not None and 0 < nim_val < 2:
                                        nim_val = nim_val * 4
                                    nim_by_label[label] = round(nim_val, 2)

                                db_nim_non_zero_count = len(nim_by_label)
                                if (not has_nim_values) or (db_nim_non_zero_count > live_nim_non_zero_count):
                                    if years:
                                        nim_data = [nim_by_label.get(label, 0) for label in years]
                                    else:
                                        years = list(nim_by_label.keys())
                                        nim_data = [nim_by_label[label] for label in years]

                        else:  # period == 'year'
                            cursor.execute(
                                """
                                SELECT year, AVG(CASE
                                    WHEN cof IS NOT NULL AND nim > 0 AND nim < 2 THEN nim * 4
                                    ELSE nim
                                END) AS nim_year
                                                                FROM ratio_wide
                                WHERE symbol = ?
                                  AND period_type = 'quarter'
                                  AND nim IS NOT NULL
                                GROUP BY year
                                ORDER BY year ASC
                                """,
                                (symbol,),
                            )
                            rows = cursor.fetchall()

                            if rows:
                                nim_by_year = {str(int(r['year'])): round(float(r['nim_year']), 2) for r in rows if r['nim_year'] is not None}
                                db_nim_non_zero_count = len(nim_by_year)
                                if (not has_nim_values) or (db_nim_non_zero_count > live_nim_non_zero_count):
                                    if years:
                                        nim_data = [nim_by_year.get(str(y), 0) for y in years]
                                    else:
                                        years = sorted(nim_by_year.keys())
                                        nim_data = [nim_by_year[y] for y in years]

                    conn.close()
            except Exception as db_exc:
                logger.warning(f"NIM DB fallback failed for {symbol}: {db_exc}")

        result = {
            'success': True,
            'data': {
                'years': years,
                'roe_data': roe_data,
                'roa_data': roa_data,
                'pe_ratio_data': pe_ratio_data,
                'pb_ratio_data': pb_ratio_data,
                'current_ratio_data': current_ratio_data,
                'quick_ratio_data': quick_ratio_data,
                'cash_ratio_data': cash_ratio_data,
                'nim_data': nim_data
            }
        }
        _cache_set(cache_key, result)
        return jsonify(result)

    except Exception as exc:
        logger.error(f"API /historical-chart-data error {symbol}: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500

# ===================== DETAILED INFO & HISTORY =====================

@stock_bp.route('/company/profile/<symbol>')
def get_company_profile(symbol):
    """Get company overview/description from vnstock API (VietCap source)"""
    try:
        is_valid, result = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({'error': result, 'success': False}), 400
        symbol = result
        
        # Check cache
        cache_key = f'profile_{symbol}'
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)
        
        try:
            # Use VCI source via provider if possible, or direct vnstock
            company = Company(symbol=symbol, source='VCI')
            overview_df = company.overview()
            
            if overview_df is None or (hasattr(overview_df, 'empty') and overview_df.empty):
                return jsonify({'success': False, 'message': 'No overview data available'}), 404
            
            def safe_get(df, column, default=''):
                try:
                    if hasattr(df, 'columns') and column in df.columns:
                        val = df[column].iloc[0]
                        if pd.notna(val): return str(val)
                    return default
                except: return default
            
            company_profile_text = safe_get(overview_df, 'company_profile', '')
            history = safe_get(overview_df, 'history', '')
            industry = safe_get(overview_df, 'icb_name3', '')
            
            profile_result = {
                'symbol': symbol,
                'company_name': symbol,
                'company_profile': company_profile_text or history,
                'industry': industry,
                'charter_capital': safe_get(overview_df, 'charter_capital', ''),
                'issue_share': safe_get(overview_df, 'issue_share', ''),
                'history': history[:300] + '...' if len(history) > 300 else history,
                'success': True
            }
            _cache_set(cache_key, profile_result)
            return jsonify(profile_result)
            
        except Exception as e:
            logger.error(f"Error fetching overview for {symbol}: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
            
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500

@stock_bp.route('/stock/history/<symbol>')
def get_stock_history(symbol):
    """Get historical price data for charting (returns last 6M to 10Y based on param)"""
    try:
        is_valid, result = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({'error': result, 'success': False}), 400
        symbol = result
        
        try:
            quote = Quote(symbol=symbol, source='VCI')
            range_param = request.args.get('period', request.args.get('range', '6M')).upper()
            days_map = {'1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825, 'ALL': 3650}
            days_back = days_map.get(range_param, 180)
            
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            
            history_df = quote.history(start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), interval='1D')
            
            if history_df is None or history_df.empty:
                return jsonify({'success': False, 'message': 'No historical data available'}), 404
            
            history_df.columns = [c.lower() for c in history_df.columns]
            history_data = []
            
            date_col = next((c for c in ['time', 'date', 'tradingdate'] if c in history_df.columns), 'time')
            
            for _, row in history_df.iterrows():
                try:
                    d_val = row.get(date_col, row.name)
                    d_str = d_val.strftime('%Y-%m-%d') if hasattr(d_val, 'strftime') else str(d_val).split(' ')[0]
                    history_data.append({
                        'date': d_str,
                        'open': float(row.get('open', 0)),
                        'high': float(row.get('high', 0)),
                        'low': float(row.get('low', 0)),
                        'close': float(row.get('close', 0)),
                        'volume': float(row.get('volume', 0))
                    })
                except: continue
            
            return jsonify({'symbol': symbol, 'data': history_data, 'count': len(history_data), 'success': True})
            
        except Exception as e:
            logger.error(f"Error fetching history for {symbol}: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
            
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500

@stock_bp.route("/history/<symbol>")
def api_history_legacy(symbol):
    """Legacy endpoint for history (flexible start/end dates)"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        start_str = request.args.get('start', start_date.strftime('%Y-%m-%d'))
        end_str = request.args.get('end', end_date.strftime('%Y-%m-%d'))
        
        quote = Quote(symbol=symbol, source='VCI')
        history_df = quote.history(start=start_str, end=end_str, interval='1D')
        
        if history_df is not None and not history_df.empty:
            if isinstance(history_df.index, pd.DatetimeIndex): history_df = history_df.reset_index()
            history_data = history_df.to_dict(orient='records')
            # Serialize dates
            for item in history_data:
                for k, v in item.items():
                    if isinstance(v, (datetime, pd.Timestamp)): item[k] = v.strftime('%Y-%m-%d')
            return jsonify({"success": True, "data": history_data})
        else:
            return jsonify({"success": True, "data": []})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/stock/peers/<symbol>")
def api_stock_peers(symbol):
    """Get peer stocks for industry comparison"""
    try:
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({"success": False, "error": clean_symbol}), 400
        provider = get_provider()
        peers = provider.get_stock_peers(clean_symbol)
        return jsonify({"success": True, "data": peers})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/tickers")
def api_tickers():
    """Serve the latest ticker_data.json content"""
    try:
        # Prefer static ticker file when available
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        ticker_file = os.path.join(root_dir, 'frontend-next', 'public', 'ticker_data.json')
        
        # Fallback to old path if needed
        if not os.path.exists(ticker_file):
            ticker_file = os.path.join(root_dir, 'frontend', 'ticker_data.json')
            
        if os.path.exists(ticker_file):
            with open(ticker_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return jsonify(data)

        # Fallback: build ticker list from SQLite (works on VPS where frontend files may not exist)
        provider = get_provider()
        conn = provider.db._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT symbol, name, industry, exchange
            FROM company
            ORDER BY symbol
        """)
        rows = cursor.fetchall()
        conn.close()

        tickers = [
            {
                "symbol": row[0],
                "name": row[1] or row[0],
                "sector": row[2] or "Unknown",
                "exchange": row[3] or "Unknown",
            }
            for row in rows
        ]

        return jsonify({
            "last_updated": datetime.now().isoformat(),
            "count": len(tickers),
            "tickers": tickers,
            "source": "database"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@stock_bp.route("/news/<symbol>")
def api_news(symbol):
    """Get news for a symbol"""
    try:
        # Check cache
        cache_key = f'news_{symbol}'
        cached = _cache_get(cache_key)
        if cached: return jsonify(cached)

        stock = Vnstock().stock(symbol=symbol, source='VCI')
        news_df = stock.company.news()
        
        result = {"success": True, "data": []}
        if news_df is not None and not news_df.empty:
            news_data = []
            for _, row in news_df.head(15).iterrows():
                # Extract date logic omitted for brevity, simplified
                pub_date = row.get('public_date') or row.get('created_at')
                news_data.append({
                    "title": row.get('news_title', row.get('title', '')),
                    "url": row.get('news_source_link', row.get('url', '#')),
                    "source": "HSX" if "hsx.vn" in str(row.get('news_source_link', '')) else "VCI",
                    "publish_date": str(pub_date)
                })
            result = {"success": True, "data": news_data}
        
        _cache_set(cache_key, result)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/events/<symbol>")
@stock_bp.route("/events/<symbol>")
def api_events(symbol):
    """Get events for a symbol"""
    try:
        # Check cache
        cache_key = f'events_{symbol}'
        cached = _cache_get(cache_key)
        if cached: return jsonify(cached)

        stock = Vnstock().stock(symbol=symbol, source='VCI')
        events_df = stock.company.events()
        
        result = {"success": True, "data": []}
        if events_df is not None and not events_df.empty:
            events_data = []
            for _, row in events_df.head(10).iterrows():
                events_data.append({
                    "event_name": row.get('event_title', ''),
                    "event_code": row.get('event_list_name', 'Event'),
                    "notify_date": str(row.get('public_date', '')).split(' ')[0],
                    "url": row.get('source_url', '#')
                })
            result = {"success": True, "data": events_data}
            
        _cache_set(cache_key, result)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@stock_bp.route("/stock/<symbol>/revenue-profit")
def api_revenue_profit(symbol):
    """Get Revenue and Net Margin data for Revenue & Profit chart"""
    period = request.args.get('period', 'quarter')
    is_valid, result = validate_stock_symbol(symbol)
    if not is_valid: return jsonify({"error": result}), 400
    symbol = result

    cache_key = f'rev_profit_{symbol}_{period}'
    cached = _cache_get(cache_key)
    if cached: return jsonify(cached)

    try:
        provider = get_provider()
        db_path = getattr(provider, 'db_path', None)

        if not db_path or not os.path.exists(db_path):
            return jsonify({"periods": [], "error": "Database not found"})

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name='fin_stmt'")
        has_financial_statements = cursor.fetchone() is not None

        rows = []
        if has_financial_statements:
            cursor.execute(
                """
                SELECT year, quarter, data
                                FROM fin_stmt
                WHERE symbol = ?
                  AND report_type = 'income'
                  AND period_type = ?
                ORDER BY year DESC, quarter DESC
                LIMIT 24
                """,
                (symbol, period),
            )
            rows = cursor.fetchall()
        conn.close()

        revenue_key_hints = [
            'revenue',
            'doanh thu',
            'net sales',
            'sales',
        ]
        net_profit_key_hints = [
            'attribute to parent company',
            'net profit',
            'net income',
            'lợi nhuận sau thuế',
            'profit after tax',
        ]
        net_margin_key_hints = [
            'net profit margin',
            'biên lợi nhuận ròng',
        ]

        def _safe_float(value):
            try:
                return float(value)
            except Exception:
                return None

        def _pick_metric(data_dict, hints, reject_tokens=None):
            reject_tokens = reject_tokens or []
            for key, value in data_dict.items():
                key_lower = str(key).lower()
                if any(token in key_lower for token in reject_tokens):
                    continue
                if any(hint in key_lower for hint in hints):
                    val = _safe_float(value)
                    if val is not None:
                        return val
            return None

        periods = []
        for year, quarter, data_json in rows:
            try:
                data = json.loads(data_json) if data_json else {}

                revenue = _pick_metric(
                    data,
                    revenue_key_hints,
                    reject_tokens=['yoy', '%', 'growth', 'margin'],
                )
                net_profit = _pick_metric(
                    data,
                    net_profit_key_hints,
                    reject_tokens=['yoy', '%', 'growth', 'margin'],
                )
                net_margin = _pick_metric(data, net_margin_key_hints)

                if revenue is None:
                    continue

                # Normalize revenue to billions for chart display.
                # If value is already in Bn it is typically < 1,000,000.
                revenue_bn = (revenue / 1_000_000_000) if abs(revenue) > 1_000_000 else revenue

                if net_margin is None and net_profit is not None and revenue not in (0, None):
                    net_margin = (net_profit / revenue) * 100

                q = int(quarter or 0)
                periods.append({
                    "period": f"{year}" if period == 'year' else f"{year} Q{q}",
                    "revenue": round(revenue_bn, 2),
                    "netMargin": round(float(net_margin), 2) if net_margin is not None else 0,
                    "year": int(year),
                    "quarter": q,
                })
            except Exception:
                continue


        periods.sort(key=lambda item: (item['year'], item.get('quarter', 0)))
        result = {"periods": periods}
        if periods:
            _cache_set(cache_key, result)
        return jsonify(result)
    except Exception as ex:
        logger.error(f"Error fetching revenue/profit for {symbol}: {ex}")
        return jsonify({"periods": []})

@stock_bp.route("/valuation/<symbol>", methods=['GET', 'POST'])
def api_valuation(symbol):
    """
    Calculate valuation using ValuationService (proper DCF + PS + comparables).
    """
    try:
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({'success': False, 'error': clean_symbol}), 400

        request_data = request.get_json(silent=True) or {}

        svc = get_valuation_service()
        result = svc.calculate(clean_symbol, request_data)

        return jsonify(result), (200 if result.get('success') else 404)

    except Exception as e:
        logger.error(f"Valuation error for {symbol}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@stock_bp.route("/stock/holders/<symbol>", methods=['GET'])
@stock_bp.route("/holders/<symbol>", methods=['GET'])
def api_stock_holders(symbol):
    """Return holders data for stock detail page (institutional + insiders)."""
    try:
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({'success': False, 'error': clean_symbol}), 400

        cache_key = f"holders_{clean_symbol}"
        cached = _cache_get(cache_key)
        if cached:
            return jsonify(cached)

        db_path = resolve_stocks_db_path()
        if not db_path or not os.path.exists(db_path):
            return jsonify({'success': False, 'error': 'Database not found'}), 503

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Resolve current price from overview for value calculation.
        current_price = 0.0
        try:
            row_cp = cur.execute(
                "SELECT current_price FROM overview WHERE symbol = ? LIMIT 1",
                (clean_symbol,),
            ).fetchone()
            if row_cp and row_cp['current_price'] is not None:
                current_price = _to_json_number(row_cp['current_price'])
        except Exception:
            current_price = 0.0

        latest_holder_date, latest_holder_raw, holder_row_count, holder_latest_count = _select_snapshot_date(
            conn=conn,
            table='shareholders',
            symbol=clean_symbol,
            min_rows_for_complete=5,
            max_candidates=12,
        )

        latest_officer_date, latest_officer_raw, officer_row_count, officer_latest_count = _select_snapshot_date(
            conn=conn,
            table='officers',
            symbol=clean_symbol,
            min_rows_for_complete=3,
            max_candidates=12,
        )

        if current_price <= 0:
            try:
                provider = get_provider()
                live_price = provider.get_current_price_with_change(clean_symbol)
                if live_price and _to_json_number(live_price.get('current_price')) > 0:
                    current_price = _to_json_number(live_price.get('current_price'))
            except Exception:
                pass

        if current_price <= 0:
            try:
                row_cp = cur.execute(
                    """
                    SELECT market_cap, outstanding_share
                    FROM ratio_wide
                    WHERE symbol = ?
                      AND outstanding_share IS NOT NULL
                      AND outstanding_share > 0
                      AND market_cap IS NOT NULL
                      AND market_cap > 0
                    ORDER BY year DESC,
                             CASE WHEN quarter IS NULL THEN -1 ELSE quarter END DESC
                    LIMIT 1
                    """,
                    (clean_symbol,),
                ).fetchone()
                if row_cp:
                    market_cap = _to_json_number(row_cp['market_cap'])
                    shares = _to_json_number(row_cp['outstanding_share'])
                    if market_cap > 0 and shares > 0:
                        current_price = market_cap / shares
            except Exception:
                pass

        institutional: list[dict] = []
        all_shareholders: list[dict] = []
        individuals: list[dict] = []
        if latest_holder_date:
            holder_rows = cur.execute(
                """
                SELECT share_holder, quantity, share_own_percent, update_date
                FROM shareholders
                WHERE symbol = ?
                  AND update_date = ?
                ORDER BY quantity DESC
                """,
                (clean_symbol, latest_holder_date),
            ).fetchall()

            for r in holder_rows:
                manager = (r['share_holder'] or '').strip()
                shares = _to_json_number(r['quantity'])
                own_pct = _to_json_number(r['share_own_percent'])
                prev_qty = _query_previous_quantity(
                    conn=conn,
                    table='shareholders',
                    symbol=clean_symbol,
                    name_field='share_holder',
                    name_value=manager,
                    before_date=latest_holder_date,
                    qty_field='quantity',
                )
                item = {
                    'manager': manager,
                    'shares': shares,
                    'ownership_percent': own_pct,
                    'value': _to_json_number(shares * current_price),
                    'change_percent': _compute_change_pct(shares, prev_qty),
                    'update_date': r['update_date'],
                }
                all_shareholders.append(item)

                if _holder_group(manager) == 'institutional':
                    institutional.append(item)
                else:
                    individuals.append(item)

        # Keep page useful if strict name classification is too sparse.
        if len(institutional) < 10 and all_shareholders:
            seen = {str(x.get('manager') or '').strip().lower() for x in institutional}
            for item in all_shareholders:
                key = str(item.get('manager') or '').strip().lower()
                if key in seen:
                    continue
                institutional.append(item)
                seen.add(key)
                if len(institutional) >= min(50, len(all_shareholders)):
                    break

        insiders: list[dict] = []
        if latest_officer_date:
            officer_rows = cur.execute(
                """
                SELECT officer_name, officer_position, quantity, officer_own_percent, update_date
                FROM officers
                WHERE symbol = ?
                  AND update_date = ?
                ORDER BY quantity DESC
                """,
                (clean_symbol, latest_officer_date),
            ).fetchall()

            for r in officer_rows:
                name = (r['officer_name'] or '').strip()
                shares = _to_json_number(r['quantity'])
                own_pct = _to_json_number(r['officer_own_percent'])
                prev_qty = _query_previous_quantity(
                    conn=conn,
                    table='officers',
                    symbol=clean_symbol,
                    name_field='officer_name',
                    name_value=name,
                    before_date=latest_officer_date,
                    qty_field='quantity',
                )
                insiders.append(
                    {
                        'name': name,
                        'position': (r['officer_position'] or '').strip(),
                        'shares': shares,
                        'ownership_percent': own_pct,
                        'value': _to_json_number(shares * current_price),
                        'change_percent': _compute_change_pct(shares, prev_qty),
                        'update_date': r['update_date'],
                    }
                )

        conn.close()

        summary = {
            'institutional_count': int(len(institutional)),
            'insider_count': int(len(insiders)),
            'institutional_total_shares': float(sum(_to_json_number(x.get('shares')) for x in institutional)),
            'institutional_total_value': float(sum(_to_json_number(x.get('value')) for x in institutional)),
        }

        payload = {
            'success': True,
            'symbol': clean_symbol,
            'current_price': float(current_price),
            'as_of_shareholders': latest_holder_date,
            'as_of_officers': latest_officer_date,
            'as_of_shareholders_latest_raw': latest_holder_raw,
            'as_of_officers_latest_raw': latest_officer_raw,
            'shareholders_snapshot_rows': int(holder_row_count),
            'shareholders_latest_rows': int(holder_latest_count),
            'officers_snapshot_rows': int(officer_row_count),
            'officers_latest_rows': int(officer_latest_count),
            'summary': summary,
            'institutional': institutional,
            'insiders': insiders,
            'politicians': [],
        }

        _cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        logger.error(f"Holders endpoint error for {symbol}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# Polymarket proxy  (avoids CORS when called from the browser)
# ──────────────────────────────────────────────────────────────────────────────
_polymarket_cache: dict = {}
_POLYMARKET_TTL = 300  # 5 minutes

@stock_bp.route("/polymarket/events", methods=['GET'])
def polymarket_events():
    """
    Proxy for Polymarket Gamma API.
    Fetches active economic events (Fed, rates, inflation, recession, GDP, S&P).
    """
    import urllib.request
    import urllib.error

    now = _time.time()
    cached = _polymarket_cache.get('events')
    if cached and now - cached['ts'] < _POLYMARKET_TTL:
        return jsonify(cached['data'])

    # Economic keyword filter - must match question/title
    KEYWORDS = [
        'fed', 'federal reserve', 'fomc', 'rate cut', 'rate hike', 'interest rate',
        'inflation', 'cpi', 'gdp', 'recession', 'unemployment', 'nonfarm', 'payroll',
        's&p', 'sp500', 'dow', 'nasdaq', 'stock market', 'economy', 'tariff',
        'debt ceiling', 'treasury', 'dollar', 'usd', 'yield curve',
    ]

    def _fetch(tag_slug: str, limit: int = 30) -> list:
        url = (
            f'https://gamma-api.polymarket.com/events'
            f'?active=true&closed=false&limit={limit}&tag_slug={tag_slug}'
        )
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception:
            return []

    def _vol(m: dict) -> float:
        try:
            return float(m.get('volume') or 0)
        except Exception:
            return 0.0

    # Try economics + macro tags
    raw: list = []
    for tag in ('economics', 'finance', 'politics'):
        raw.extend(_fetch(tag, 50))
        if len(raw) >= 100:
            break

    # Deduplicate by event id
    seen: set = set()
    deduped: list = []
    for ev in raw:
        eid = str(ev.get('id', ''))
        if eid and eid not in seen:
            seen.add(eid)
            deduped.append(ev)

    output = []
    for ev in deduped:
        markets = ev.get('markets') or []
        if not markets:
            continue
        top = max(markets, key=_vol)
        question = str(top.get('question') or ev.get('title') or '').lower()
        # Keep only events matching economic keywords
        if not any(kw in question for kw in KEYWORDS):
            continue
        try:
            prices = json.loads(top.get('outcomePrices') or '[0.5,0.5]')
        except Exception:
            prices = [0.5, 0.5]
        yes_price = float(prices[0]) if prices else 0.5
        volume = _vol(top)
        output.append({
            'id': str(ev.get('id', '')),
            'question': top.get('question') or ev.get('title', ''),
            'slug': ev.get('slug') or str(ev.get('id', '')),
            'yesPrice': yes_price,
            'volume': volume,
        })

    output.sort(key=lambda x: x['volume'], reverse=True)
    result = output[:3]
    _polymarket_cache['events'] = {'ts': now, 'data': result}
    return jsonify(result)
