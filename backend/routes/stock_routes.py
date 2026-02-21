from flask import Blueprint, jsonify, request
import logging
import pandas as pd
import numpy as np
import sqlite3
from datetime import datetime, timedelta
import json
import os
import re
from backend.extensions import get_provider
from backend.utils import validate_stock_symbol
from vnstock import Vnstock, Quote, Company

stock_bp = Blueprint('stock', __name__)
logger = logging.getLogger(__name__)

# ===================== IN-MEMORY CACHE =====================
import time as _time
_cache = {}  # key -> (timestamp, data)
_CACHE_TTL = 600  # 10 minutes default
_CACHE_TTL_LONG = 3600  # 1 hour for static-ish data (profile, history)

def _cache_get(key, ttl=None):
    entry = _cache.get(key)
    effective_ttl = ttl if ttl is not None else _CACHE_TTL
    if entry and (_time.time() - entry[0]) < effective_ttl:
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
                "shares_outstanding": shares
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
        
        result = {}
        for symbol in symbols:
            try:
                # Optimized batch fetch could be implemented in provider
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
                
                result[symbol] = {
                    "price": current_price,
                    "changePercent": change_percent,
                    "companyName": company_name,
                    "exchange": exchange
                }
            except Exception as e:
                logger.warning(f"Error getting data for {symbol}: {e}")
                result[symbol] = {"price": None, "changePercent": 0, "companyName": symbol, "exchange": "HOSE"}
        
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
                
        clean_data = convert_nan_to_none(data)
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

                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ratio_wide'")
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
        
        # Check cache (1 hour TTL - profile almost never changes)
        cache_key = f'profile_{symbol}'
        cached = _cache_get(cache_key, ttl=_CACHE_TTL_LONG)
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
            logger.warning(f"Could not fetch profile for {symbol} via vnstock: {e}")
            # Return a graceful fallback instead of 500
            fallback = {
                'symbol': symbol,
                'company_name': symbol,
                'company_profile': '',
                'industry': '',
                'success': False,
                'error': str(e)
            }
            return jsonify(fallback), 200  # Return 200 so frontend doesn't retry aggressively

    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 200

@stock_bp.route('/stock/history/<symbol>')
def get_stock_history(symbol):
    """Get historical price data for charting (cached 1h for ALL period)"""
    try:
        is_valid, result = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({'error': result, 'success': False}), 400
        symbol = result
        
        range_param = request.args.get('period', request.args.get('range', '6M')).upper()
        cache_key = f'history_{symbol}_{range_param}'
        ttl = _CACHE_TTL_LONG if range_param == 'ALL' else _CACHE_TTL  # cache ALL for 1h, rest 10min
        cached = _cache_get(cache_key, ttl=ttl)
        if cached:
            return jsonify(cached)
        
        try:
            quote = Quote(symbol=symbol, source='VCI')
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
            
            result_data = {'symbol': symbol, 'data': history_data, 'count': len(history_data), 'success': True}
            _cache_set(cache_key, result_data)
            return jsonify(result_data)
            
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
    """Get news for a symbol from AI VCI API"""
    try:
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid: return jsonify({"success": False, "error": clean_symbol}), 400

        # Check cache
        cache_key = f'news_{clean_symbol}'
        cached = _cache_get(cache_key)
        if cached: return jsonify(cached)

        # Get news for 1 year period up to now
        from datetime import datetime, timedelta
        import requests
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        url = f"https://ai.vietcap.com.vn/api/v3/news_info?page=1&ticker={clean_symbol}&industry=&update_from={start_date.strftime('%Y-%m-%d')}&update_to={end_date.strftime('%Y-%m-%d')}&sentiment=&newsfrom=&language=vi&page_size=12"
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://trading.vietcap.com.vn',
            'Referer': 'https://trading.vietcap.com.vn/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
        
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        
        news_data = []
        for item in data.get('news_info', []):
            news_data.append({
                "title": item.get('news_title', ''),
                "url": item.get('news_source_link', '#'),
                "source": item.get('news_from_name', ''),
                "publish_date": item.get('public_date', ''),
                "image_url": item.get('image_url', ''),
                "sentiment": item.get('sentiment', ''),
                "score": item.get('score', 0),
                "female_audio_duration": item.get('female_audio_duration', 0),
                "male_audio_duration": item.get('male_audio_duration', 0)
            })
            
        result = {"success": True, "data": news_data}
        _cache_set(cache_key, result) # Cache for default TTL
        return jsonify(result)
    except Exception as exc:
        logger.error(f"Error fetching VCI AI news for {symbol}: {exc}")
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
    
    try:
        provider = get_provider()
        db_path = getattr(provider, 'db_path', None)

        if not db_path or not os.path.exists(db_path):
            return jsonify({"periods": [], "error": "Database not found"})

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fin_stmt'")
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

        if not periods:
            try:
                stock = Vnstock().stock(symbol=symbol, source='VCI')
                income_df = stock.finance.income_statement(period=period, lang='en', dropna=True)
                if income_df is None or income_df.empty:
                    income_df = stock.finance.income_statement(period=period, lang='vn', dropna=True)

                if income_df is not None and not income_df.empty:
                    year_col = None
                    quarter_col = None
                    for col in income_df.columns:
                        col_text = str(col)
                        if 'yearReport' in col_text or col_text.lower() == 'year':
                            year_col = col
                        if 'lengthReport' in col_text or col_text.lower() == 'quarter':
                            quarter_col = col

                    if year_col:
                        sort_cols = [year_col]
                        sort_dirs = [True]
                        if period == 'quarter' and quarter_col:
                            sort_cols.append(quarter_col)
                            sort_dirs.append(True)
                        income_df = income_df.sort_values(sort_cols, ascending=sort_dirs)

                    for _, row in income_df.tail(24).iterrows():
                        row_dict = row.to_dict()
                        revenue = _pick_metric(
                            row_dict,
                            revenue_key_hints,
                            reject_tokens=['yoy', '%', 'growth', 'margin'],
                        )
                        net_profit = _pick_metric(
                            row_dict,
                            net_profit_key_hints,
                            reject_tokens=['yoy', '%', 'growth', 'margin'],
                        )
                        net_margin = _pick_metric(row_dict, net_margin_key_hints)

                        if revenue is None:
                            continue

                        revenue_bn = (revenue / 1_000_000_000) if abs(revenue) > 1_000_000 else revenue
                        if net_margin is None and net_profit is not None and revenue not in (0, None):
                            net_margin = (net_profit / revenue) * 100

                        y_raw = row.get(year_col) if year_col is not None else datetime.now().year
                        q_raw = row.get(quarter_col) if quarter_col is not None else 0
                        y = int(_safe_float(y_raw) or datetime.now().year)
                        q = int(_safe_float(q_raw) or 0)

                        periods.append({
                            "period": f"{y}" if period == 'year' else f"{y} Q{q}",
                            "revenue": round(revenue_bn, 2),
                            "netMargin": round(float(net_margin), 2) if net_margin is not None else 0,
                            "year": y,
                            "quarter": q,
                        })
            except Exception as live_exc:
                logger.warning(f"Revenue live fallback failed for {symbol}: {live_exc}")

        periods.sort(key=lambda item: (item['year'], item.get('quarter', 0)))
        return jsonify({"periods": periods})
    except Exception as ex:
        logger.error(f"Error fetching revenue/profit for {symbol}: {ex}")
        return jsonify({"periods": []})

@stock_bp.route("/valuation/<symbol>", methods=['POST'])
def api_valuation(symbol):
    """
    Calculate valuation based on assumptions.
    Simplified implementation to support the frontend UI.
    """
    try:
        is_valid, clean_symbol = validate_stock_symbol(symbol)
        if not is_valid:
            return jsonify({'success': False, 'error': clean_symbol}), 400

        data = request.get_json(silent=True) or {}

        def to_float(value, default=0.0):
            try:
                if value is None or pd.isna(value):
                    return default
                return float(value)
            except Exception:
                return default

        provider = get_provider()

        stock_data = provider.get_stock_data(clean_symbol, period='quarter')
        if not stock_data or not stock_data.get('success'):
            stock_data = provider.get_stock_data(clean_symbol, period='year')

        current_price = to_float(data.get('currentPrice'), 0.0)
        if current_price <= 0:
            current_price = to_float(stock_data.get('current_price'), 0.0)

        eps = to_float(stock_data.get('eps_ttm'))
        if eps <= 0:
            eps = to_float(stock_data.get('eps'))
        if eps <= 0:
            eps = to_float(stock_data.get('earnings_per_share'))

        bvps = to_float(stock_data.get('bvps'))
        if bvps <= 0:
            bvps = to_float(stock_data.get('book_value_per_share'))
        if bvps <= 0:
            total_equity = to_float(stock_data.get('total_equity'))
            shares_outstanding = to_float(stock_data.get('shares_outstanding'))
            if total_equity > 0 and shares_outstanding > 0:
                bvps = total_equity / shares_outstanding

        peers = provider.get_stock_peers(clean_symbol) or []
        peer_pe_values = []
        peer_pb_values = []

        for peer in peers:
            pe_val = to_float(peer.get('pe'))
            pb_val = to_float(peer.get('pb'))

            if 0 < pe_val <= 80:
                peer_pe_values.append(pe_val)
            if 0 < pb_val <= 20:
                peer_pb_values.append(pb_val)

        if peer_pe_values:
            peer_pe_values.sort()
            peer_pe = peer_pe_values[len(peer_pe_values) // 2]
        else:
            peer_pe = 15.0

        if peer_pb_values:
            peer_pb_values.sort()
            peer_pb = peer_pb_values[len(peer_pb_values) // 2]
        else:
            peer_pb = 1.5

        graham = 0.0
        if eps > 0 and bvps > 0:
            graham = float((22.5 * eps * bvps) ** 0.5)

        justified_pe = float(eps * peer_pe) if eps > 0 else 0.0
        justified_pb = float(bvps * peer_pb) if bvps > 0 else 0.0

        growth = to_float(data.get('revenueGrowth'), 8.0) / 100
        dcf_base = current_price if current_price > 0 else max(justified_pe, justified_pb, graham, 0)
        dcf_value = float(dcf_base * (1 + growth)) if dcf_base > 0 else 0.0

        valuations = {
            'fcfe': dcf_value,
            'fcff': dcf_value * 0.95,
            'justified_pe': justified_pe,
            'justified_pb': justified_pb,
            'graham': graham,
        }

        weights = data.get('modelWeights', {}) or {}
        if not any(to_float(w) > 0 for w in weights.values()):
            weights = {
                'fcfe': 20,
                'fcff': 20,
                'justified_pe': 20,
                'justified_pb': 20,
                'graham': 20,
            }

        total_val = 0.0
        total_weight = 0.0
        for key, weight in weights.items():
            val = to_float(valuations.get(key))
            w = to_float(weight)
            if val > 0 and w > 0:
                total_val += val * w
                total_weight += w

        weighted_avg = (total_val / total_weight) if total_weight > 0 else 0.0
        valuations['weighted_average'] = weighted_avg

        return jsonify({
            'success': True,
            'valuations': valuations,
            'symbol': clean_symbol,
            'inputs': {
                'current_price': current_price,
                'eps_ttm': eps,
                'bvps': bvps,
                'peer_pe_used': peer_pe,
                'peer_pb_used': peer_pb,
                'peer_count': len(peers),
            },
        })

    except Exception as e:
        logger.error(f"Valuation error for {symbol}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
