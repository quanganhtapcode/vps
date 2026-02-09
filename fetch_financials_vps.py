"""
Fetch Financial Data to SQLite Database
Supports vnstock 3.4+ with API key
Original from server: /root/finance_app/backend/scripts/fetch_financials.py
"""
import sqlite3
import json
import logging
import time
import argparse
import os
import sys
from datetime import datetime
import pandas as pd
import re
from vnstock import Vnstock, Company

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("fetch_log.txt", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Paths
# Smart DB path: check for 'backend/stocks.db' (local structure) or 'stocks.db' (VPS structure)
if os.path.exists(os.path.join("backend", "stocks.db")):
    DB_PATH = os.path.join("backend", "stocks.db")
else:
    DB_PATH = "stocks.db"

# Select Stock List Source
# Priority:
# 1. limit_stocks.json (Explicit subset for updates)
# 2. frontend-next/public/ticker_data.json (Full generated list)
# 3. stock_list.json (Backup)
if os.path.exists("limit_stocks.json"):
    STOCK_LIST_PATH = "limit_stocks.json"
    print(f"Using LIMIT stock list: {STOCK_LIST_PATH}")
elif os.path.exists(os.path.join("frontend-next", "public", "ticker_data.json")):
    STOCK_LIST_PATH = os.path.join("frontend-next", "public", "ticker_data.json")
else:
    STOCK_LIST_PATH = "stock_list.json"

# ============ API KEY SETUP (vnstock 3.4+) ============
def setup_vnstock_api_key():
    """
    Setup vnstock API key for version 3.4+
    API key is optional but recommended for higher rate limits
    
    Get your key from: https://vnstock.site/
    """
    try:
        # Check if API key exists in environment
        api_key = os.environ.get('VNSTOCK_API_KEY')
        
        if api_key:
            logger.info("✅ Using VNSTOCK_API_KEY from environment")
            return
        
        # Check if API key file exists
        key_file = os.path.join(os.path.dirname(__file__), '.vnstock_key')
        if os.path.exists(key_file):
            with open(key_file, 'r') as f:
                api_key = f.read().strip()
                os.environ['VNSTOCK_API_KEY'] = api_key
                logger.info("✅ Loaded VNSTOCK_API_KEY from .vnstock_key file")
                return
        
        logger.warning("⚠️  No API key found. Using vnstock without API key (lower rate limits)")
        logger.warning("   To use API key: Set VNSTOCK_API_KEY env var or create .vnstock_key file")
        
    except Exception as e:
        logger.warning(f"⚠️  Could not setup API key: {e}")

def load_stock_list(path):
    """Load list of stock symbols from JSON file."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Support multiple JSON structures
            if isinstance(data, list):
                # If it's a list of strings
                if all(isinstance(s, str) for s in data):
                    return data
                # If it's a list of objects with 'symbol' key
                return [item.get('symbol', item.get('Symbol', '')) for item in data if isinstance(item, dict)]
                
            elif isinstance(data, dict):
                # Check for common keys
                if 'symbols' in data:
                    return data['symbols']
                if 'tickers' in data:
                    return [t.get('symbol', t.get('Symbol', '')) for t in data['tickers'] if isinstance(t, dict)]
                
            return []
            
    except Exception as e:
        logger.error(f"Error loading stock list from {path}: {e}")
        return []

def init_db(db_path):
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Companies table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS companies (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        exchange TEXT,
        industry TEXT,
        company_profile TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Financial statements table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_statements (
        symbol TEXT,
        report_type TEXT,
        period_type TEXT,
        year INTEGER,
        quarter INTEGER,
        data TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (symbol, report_type, period_type, year, quarter)
    );
    """)

    # Stock overview table (comprehensive metrics)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_overview (
        symbol TEXT PRIMARY KEY,
        -- Listing Info
        exchange TEXT,
        industry TEXT,

        -- Valuation Ratios
        pe REAL,
        pb REAL,
        ps REAL,
        pcf REAL,
        ev_ebitda REAL,

        -- Per Share
        eps_ttm REAL,
        bvps REAL,
        dividend_per_share REAL,

        -- Profitability
        roe REAL,
        roa REAL,
        roic REAL,
        net_profit_margin REAL,
        profit_growth REAL,
        gross_margin REAL,
        operating_margin REAL,

        -- Liquidity & Leverage
        current_ratio REAL,
        quick_ratio REAL,
        cash_ratio REAL,
        debt_to_equity REAL,
        interest_coverage REAL,

        -- Efficiency
        asset_turnover REAL,
        inventory_turnover REAL,
        receivables_turnover REAL,

        -- Financial Snapshot
        revenue REAL,
        net_income REAL,
        total_assets REAL,
        total_equity REAL,
        total_debt REAL,
        cash REAL,

        -- Market Data
        market_cap REAL,
        shares_outstanding REAL,
        current_price REAL,

        -- Store full raw JSON
        overview_json TEXT,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()
    logger.info("✅ Database initialized successfully.")
    return conn

def check_rate_limit_message(text):
    """Check if text contains rate limit warning and extract wait time"""
    if not text:
        return 0
    
    # Vietnamese: "sau X giây"
    match = re.search(r'sau (\d+) giây', str(text))
    if match:
        return int(match.group(1))
    
    # English: "after X seconds"
    match = re.search(r'after (\d+) seconds', str(text), re.IGNORECASE)
    if match:
        return int(match.group(1))
    
    return 0

# ============ SMART FETCHING HELPERS ============
def get_existing_periods(conn, symbol, report_type, period_type):
    """Get list of (year, quarter) already in DB for this symbol/report."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT year, quarter FROM financial_statements
        WHERE symbol = ? AND report_type = ? AND period_type = ?
    """, (symbol, report_type, period_type))
    return set((row[0], row[1]) for row in cursor.fetchall())

def get_current_period():
    """Get current year and quarter."""
    now = datetime.now()
    year = now.year
    quarter = (now.month - 1) // 3 + 1
    return year, quarter

def should_fetch_period(year, quarter, existing_periods, current_year, current_quarter):
    """
    Decide if we should fetch data for this period.
    Rules:
    - Always fetch if not in DB
    - Always fetch current quarter and previous quarter (may have updates)
    - Skip old quarters that are already in DB
    """
    if (year, quarter) not in existing_periods:
        return True  # Not in DB, must fetch
    
    # Check if this is a recent period (current or previous quarter)
    if year == current_year and quarter >= current_quarter - 1:
        return True  # Recent, re-fetch to catch updates
    if year == current_year - 1 and current_quarter == 1 and quarter == 4:
        return True  # Previous quarter crosses year boundary
    
    return False  # Old data already in DB, skip

def company_profile_needs_update(conn, symbol, max_age_days=90):
    """Check if company profile needs to be updated. Conservative 90 days."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT updated_at FROM companies WHERE symbol = ?
    """, (symbol,))
    row = cursor.fetchone()
    if not row:
        return True  # Not in DB
    
    try:
        updated_at = datetime.fromisoformat(row[0].replace(' ', 'T').replace('Z', '+00:00').split('.')[0])
        age = (datetime.now() - updated_at).days
        return age > max_age_days
    except Exception as e:
        logger.debug(f"Date parse error for {symbol}: {e}")
        return True

def report_type_needs_update(conn, symbol, r_type, p_type):
    """
    Smart check: Do we need to call the API for this specific report?
    Returns True if we SHOULD fetch, False if we can SKIP.
    """
    cursor = conn.cursor()
    current_year, current_quarter = get_current_period()

    # Get the latest period and when it was updated
    cursor.execute("""
        SELECT year, quarter, updated_at 
        FROM financial_statements 
        WHERE symbol = ? AND report_type = ? AND period_type = ?
        ORDER BY year DESC, quarter DESC LIMIT 1
    """, (symbol, r_type, p_type))
    row = cursor.fetchone()

    if not row:
        return True # Brand new, must fetch

    last_year, last_quarter, last_updated = row[0], row[1], row[2]
    
    try:
        # Clean up timestamp for isoformat
        ts = last_updated.replace(' ', 'T').split('.')[0]
        upd_dt = datetime.fromisoformat(ts)
        days_since = (datetime.now() - upd_dt).days
    except:
        return True

    # LOGIC:
    # 1. If we updated ANY data for this report in the last 3 days, skip.
    if days_since < 3:
        return False

    # 2. If it's a 'year' report and we have last year's data
    if p_type == 'year':
        if last_year >= current_year - 1:
            if days_since < 30: return False # Only re-check yearly once a month
    
    # 3. If it's a 'quarter' report
    else:
        # If we already have the "Current" or "Previous" quarter
        is_latest = False
        if last_year == current_year and last_quarter >= current_quarter - 1:
            is_latest = True
        elif last_year == current_year - 1 and current_quarter == 1 and last_quarter == 4:
            is_latest = True
            
        if is_latest and days_since < 14:
            return False # We have the latest quarter, don't check for 2 weeks

    return True

def save_financial_report(conn, symbol, report_type, period_type, df, existing_periods=None):
    """Save financial report data to database (with optional skip logic)"""
    if df is None or df.empty:
        return 0

    cursor = conn.cursor()
    records = df.to_dict(orient='records')
    current_year, current_quarter = get_current_period()
    saved_count = 0
    skipped_count = 0

    for record in records:
        # Create lowercase mapping for case-insensitive lookup
        record_lower = {}
        for k, v in record.items():
            if isinstance(k, tuple):
                record_lower[str(k).lower()] = v
                if len(k) > 0:
                    record_lower[str(k[-1]).lower().strip()] = v
            else:
                record_lower[str(k).lower().strip()] = v

        # Extract year and quarter
        year = record_lower.get('year') or record_lower.get('y') or record_lower.get('nam') or record_lower.get('yearreport')
        quarter = record_lower.get('quarter') or record_lower.get('q') or record_lower.get('quy') or record_lower.get('lengthreport') or 0

        try:
            year = int(float(year)) if year else None
            if isinstance(quarter, str) and quarter.lower().startswith('q'):
                quarter = int(quarter[1:])
            quarter = int(float(quarter)) if quarter else 0
        except:
            pass

        # Fallback: parse from 'range' field
        if not year and 'range' in record:
            try:
                parts = str(record['range']).split('-')
                if len(parts) == 2:
                    quarter = int(parts[0].replace('Q', ''))
                    year = int(parts[1])
                elif len(parts) == 1:
                    year = int(parts[0])
            except:
                pass

        if not year:
            continue

        # SMART SKIP: Check if we should save this period
        if existing_periods is not None:
            if not should_fetch_period(year, quarter, existing_periods, current_year, current_quarter):
                skipped_count += 1
                continue  # Skip old data already in DB

        # Prepare final record
        final_record = {}
        for k, v in record.items():
            if isinstance(k, tuple):
                final_record[str(k)] = v
            else:
                final_record[k] = v

        json_data = json.dumps(final_record, ensure_ascii=False)

        try:
            cursor.execute("""
            INSERT OR REPLACE INTO financial_statements
            (symbol, report_type, period_type, year, quarter, data, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (symbol, report_type, period_type, year, quarter, json_data))
            saved_count += 1
        except Exception as e:
            logger.error(f"Error saving {symbol} {report_type}: {e}")

    conn.commit()
    
    if skipped_count > 0:
        logger.debug(f"    Saved {saved_count}, skipped {skipped_count} old records for {symbol} {report_type}/{period_type}")
    
    return saved_count


def _pick_val_from_dict(d, candidates):
    """Helper to pick values from various JSON key formats"""
    # Safe float helper
    def to_float(x):
        try:
            return float(str(x).replace(',', ''))
        except:
            return 0.0

    if not d: return 0.0

    for k, v in d.items():
        k_str = str(k).lower().replace(" ", "").replace("'", "").replace('"', "")
        for cand in candidates:
             target = cand.lower().replace(" ", "")
             if target in k_str:
                 return to_float(v)
    return 0.0

# ============ ANALYSIS BUILDER (THE PERFECT LOGIC) ============
def build_stock_overview(conn, symbol):
    """
    Build the flat 'stock_overview' record from raw financial reports.
    Strategies:
    - Ratios: Strict Mapping from latest Quarterly Ratio report.
    - Balance Sheet: Latest Quarterly Snapshot (Total Debt, Assets).
    - Income Statement: TTM (Sum of last 4 quarters) for Revenue, Net Income.
    """
    cursor = conn.cursor()
    
    # --- 1. GET RAW DATA ---
    
    # Ratio (Latest Quarter)
    cursor.execute("""
        SELECT data FROM financial_statements 
        WHERE symbol = ? AND report_type = 'ratio' AND period_type = 'quarter'
        ORDER BY year DESC, quarter DESC LIMIT 1
    """, (symbol,))
    row_rat = cursor.fetchone()
    rat_data = json.loads(row_rat[0]) if row_rat else {}
    
    # Balance Sheet (Latest Quarter)
    cursor.execute("""
        SELECT data FROM financial_statements 
        WHERE symbol = ? AND report_type = 'balance' AND period_type = 'quarter'
        ORDER BY year DESC, quarter DESC LIMIT 1
    """, (symbol,))
    row_bal = cursor.fetchone()
    bal_data = json.loads(row_bal[0]) if row_bal else {}
    
    # Income (Last 4 Quarters for TTM)
    cursor.execute("""
        SELECT data FROM financial_statements 
        WHERE symbol = ? AND report_type = 'income' AND period_type = 'quarter'
        ORDER BY year DESC, quarter DESC LIMIT 4
    """, (symbol,))
    rows_inc = cursor.fetchall()
    
    # --- 2. EXTRACT RATIOS (Strict Keys from DB VCI) ---
    def get_rat(patterns, mul=1.0):
        # Specific helper for Ratio table which has tuples in keys
        for p in patterns:
            # 1. Direct
            if p in rat_data: 
                try: return float(rat_data[p]) * mul
                except: pass
            
            # 2. Fuzzy
            p_clean = p.replace(' ', '').replace("'", '"')
            for k, v in rat_data.items():
                k_clean = str(k).replace(' ', '').replace("'", '"')
                if p_clean in k_clean:
                    try: return float(v) * mul
                    except: pass
        return 0.0

    pe = get_rat(["('Chỉ tiêu định giá', 'P/E')", "('Chỉ tiêu định giá', 'P/E Ratio')"])
    pb = get_rat(["('Chỉ tiêu định giá', 'P/B')", "('Chỉ tiêu định giá', 'P/B Ratio')"])
    ps = get_rat(["('Chỉ tiêu định giá', 'P/S')", "('Chỉ tiêu định giá', 'P/S Ratio')"])
    pcf = get_rat(["('Chỉ tiêu định giá', 'P/Cash Flow')"])
    ev_ebitda = get_rat(["('Chỉ tiêu định giá', 'EV/EBITDA')"])
    eps = get_rat(["('Chỉ tiêu định giá', 'EPS (VND)')", "('Chỉ tiêu định giá', 'EPS')"])
    bvps = get_rat(["('Chỉ tiêu định giá', 'BVPS (VND)')", "('Chỉ tiêu định giá', 'BVPS')"])
    
    roe = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'ROE (%)')"], 100)
    roa = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'ROA (%)')"], 100)
    roic = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'ROIC (%)')"], 100)
    
    net_margin = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'Net Profit Margin (%)')"], 100)
    gross_margin = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'Gross Profit Margin (%)')"], 100)
    op_margin = get_rat(["('Chỉ tiêu khả năng sinh lợi', 'EBIT Margin (%)')"], 100)
    
    current_ratio = get_rat(["('Chỉ tiêu thanh khoản', 'Current Ratio')"])
    quick_ratio = get_rat(["('Chỉ tiêu thanh khoản', 'Quick Ratio')"])
    cash_ratio = get_rat(["('Chỉ tiêu thanh khoản', 'Cash Ratio')"])
    interest_coverage = get_rat(["('Chỉ tiêu thanh khoản', 'Interest Coverage')"])
    
    # Use Ratio table Debt/Equity if available, else calc later
    debt_to_equity = get_rat(["('Chỉ tiêu cơ cấu nguồn vốn', 'Debt/Equity')", "('Chỉ tiêu cấu trúc tài chính', 'Nợ/Vốn chủ sở hữu')"])
    
    asset_turnover = get_rat(["('Chỉ tiêu hiệu quả hoạt động', 'Asset Turnover')"])
    inventory_turnover = get_rat(["('Chỉ tiêu hiệu quả hoạt động', 'Inventory Turnover')"])
    receivables_turnover = get_rat(["('Chỉ tiêu hiệu quả hoạt động', 'Receivables Turnover')"])

    # Market Cap / Shares
    shares = get_rat(["('Chỉ tiêu định giá', 'Outstanding Share (Mil. Shares)')"]) * 1_000_000
    market_cap = get_rat(["('Chỉ tiêu định giá', 'Market Capital (Bn. VND)')"]) * 1_000_000_000

    # --- 3. EXTRACT BALANCE SHEET (Latest) ---
    total_assets = _pick_val_from_dict(bal_data, ['Total Assets', 'Tổng cộng tài sản'])
    total_equity = _pick_val_from_dict(bal_data, ['Owner', 'Vốn chủ sở hữu', 'Total Equity'])
    
    # Liabilities (Total Debt)
    total_debt = _pick_val_from_dict(bal_data, ['LIABILITIES', 'Nợ phải trả', 'Total Liabilities'])
    cash = _pick_val_from_dict(bal_data, ['Cash', 'Tiền và tương đương tiền'])

    # --- 4. CALCULATE TTM INCOME ---
    revenue_ttm = 0.0
    net_income_ttm = 0.0
    
    if rows_inc:
        for r in rows_inc:
            d = json.loads(r[0])
            rev = _pick_val_from_dict(d, ['Revenue', 'Doanh thu thuần', 'Net Revenue'])
            ni = _pick_val_from_dict(d, ['Net Profit', 'Lợi nhuận sau thuế', 'Net Income'])
            if rev != 0 or ni != 0:
                revenue_ttm += rev
                net_income_ttm += ni
    
    # Fallback to Yearly if TTM is 0
    if revenue_ttm == 0:
        cursor.execute("""
            SELECT data FROM financial_statements 
            WHERE symbol = ? AND report_type = 'income' AND period_type = 'year'
            ORDER BY year DESC LIMIT 1
        """, (symbol,))
        row_year = cursor.fetchone()
        if row_year:
            d_y = json.loads(row_year[0])
            revenue_ttm = _pick_val_from_dict(d_y, ['Revenue', 'Doanh thu thuần'])
            net_income_ttm = _pick_val_from_dict(d_y, ['Net Profit', 'Lợi nhuận sau thuế'])

    # --- 5. GET LATEST PRICE (From Overview if exists, or fallback) ---
    # Since we dropped stock_prices table, we depend on what was saved or derived.
    # Actually, PE = Price / EPS. If we have PE and EPS, we have Price.
    current_price = 0
    if pe > 0 and eps > 0:
        current_price = pe * eps
    
    # If Market Cap and Shares exist
    if current_price == 0 and shares > 0 and market_cap > 0:
        current_price = market_cap / shares

    # --- 6. UPDATE DB ---
    try:
        # Get existing exchange/industry to preserve them
        cursor.execute("SELECT exchange, industry FROM companies WHERE symbol = ?", (symbol,))
        row_comp = cursor.fetchone()
        exchange = row_comp[0] if row_comp else 'Unknown'
        industry = row_comp[1] if row_comp else 'Unknown'

        cursor.execute("""
        INSERT OR REPLACE INTO stock_overview 
        (symbol, exchange, industry, 
         pe, pb, ps, pcf, ev_ebitda,
         roe, roa, roic,
         eps_ttm, bvps, dividend_per_share,
         gross_margin, operating_margin, net_profit_margin, profit_growth,
         current_ratio, quick_ratio, cash_ratio, debt_to_equity, interest_coverage,
         asset_turnover, inventory_turnover, receivables_turnover,
         revenue, net_income, total_assets, total_equity, total_debt, cash,
         market_cap, shares_outstanding, current_price,
         updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (symbol, exchange, industry,
              pe, pb, ps, pcf, ev_ebitda,
              roe, roa, roic,
              eps, bvps, 0, # div per share
              gross_margin, op_margin, net_margin, 0, # profit growth
              current_ratio, quick_ratio, cash_ratio, debt_to_equity, interest_coverage,
              asset_turnover, inventory_turnover, receivables_turnover,
              revenue_ttm, net_income_ttm, total_assets, total_equity, total_debt, cash,
              market_cap, shares, current_price))
        
        conn.commit()
        # logger.info(f"    ✨ Built analysis overview for {symbol}")
        
    except Exception as e:
        logger.error(f"Error building overview for {symbol}: {e}")

def fetch_stock_data(symbol, conn, full_history=False, data_type='all'):
    """Fetch data for a single stock with smart fetching to avoid redundant API calls"""
    stock = Vnstock().stock(symbol=symbol, source='VCI')
    has_network_error = False

    try:
        if data_type in ['all', 'financial']:
            # 1. Fetch financial statements
            logger.info(f"  📊 Fetching financials for {symbol}...")
            report_types = ['income', 'ratio', 'balance', 'cashflow']
            periods = ['quarter', 'year']

            for r_type in report_types:
                for p_type in periods:
                    try:
                        if not report_type_needs_update(conn, symbol, r_type, p_type):
                            logger.debug(f"    ⏭️ Skip {r_type} {p_type}")
                            continue

                        existing = get_existing_periods(conn, symbol, r_type, p_type)
                        
                        if r_type == 'income': df = stock.finance.income_statement(period=p_type, dropna=True)
                        elif r_type == 'ratio': df = stock.finance.ratio(period=p_type, dropna=True)
                        elif r_type == 'balance': df = stock.finance.balance_sheet(period=p_type, dropna=True)
                        elif r_type == 'cashflow': df = stock.finance.cash_flow(period=p_type, dropna=True)
                        
                        save_financial_report(conn, symbol, r_type, p_type, df, existing)
                        time.sleep(1.2) # Rate limit
                        
                    except Exception as e:
                        limit = check_rate_limit_message(str(e))
                        if limit > 0: raise Exception(f"Rate limit: {limit}")
                        logger.error(f"Error fetching {symbol} {r_type}: {e}")

            # 2. Company Info (Profile)
            if company_profile_needs_update(conn, symbol):
                logger.info(f"  🏢 Fetching profile...")
                try:
                    profile = stock.company.overview()
                    if profile is not None and not profile.empty:
                        row = profile.iloc[0]
                        name = row.get('company_name') or row.get('organ_name') or symbol
                        exch = row.get('exchange') or ''
                        ind = row.get('industry') or ''
                        desc = row.get('company_profile') or ''
                        
                        cursor = conn.cursor()
                        cursor.execute("INSERT OR REPLACE INTO companies (symbol, name, exchange, industry, company_profile, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", 
                                     (symbol, str(name), str(exch), str(ind), str(desc)))
                        conn.commit()
                except Exception as e:
                    logger.warning(f"Profile fetch failed: {e}")

            # 3. BUILD ANALYSIS OVERVIEW (The new core logic)
            build_stock_overview(conn, symbol)

    except Exception as e:
        if "Rate limit" in str(e): raise e
        logger.error(f"Critical error {symbol}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Fetch financial data from vnstock to SQLite')
    parser.add_argument('--mode', choices=['full', 'update'], default='update', help='full: fetch all stocks, update: skip recently updated')
    parser.add_argument('--type', choices=['all', 'financial', 'price'], default='all', help='Type of data to fetch')
    parser.add_argument('--symbol', type=str, help='Fetch single stock symbol')
    parser.add_argument('--api-key', type=str, help='vnstock API key (optional)')
    args = parser.parse_args()

    if args.api_key:
        os.environ['VNSTOCK_API_KEY'] = args.api_key
    else:
        setup_vnstock_api_key()

    conn = init_db(DB_PATH)

    if args.symbol:
        symbols = [args.symbol.upper()]
    else:
        symbols = load_stock_list(STOCK_LIST_PATH)
        # Simple resume logic
        if args.mode != 'full':
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT symbol FROM stock_overview WHERE updated_at >= datetime('now', '-24 hours')")
                processed = {row[0] for row in cursor.fetchall()}
                symbols = [s for s in symbols if s not in processed]
                if len(processed) > 0:
                    logger.info(f"📊 Resuming... Skipped {len(processed)} symbols already updated.")
            except: pass

    total = len(symbols)
    logger.info(f"🚀 Starting fetch: {total} symbols")
    
    for idx, symbol in enumerate(symbols):
        logger.info(f"[{idx+1}/{total}] Processing {symbol}...")
        try:
            fetch_stock_data(symbol, conn, full_history=(args.mode=='full'), data_type=args.type)
        except Exception as e:
            if "Rate limit" in str(e):
                logger.warning(f"Rate limit hit. Waiting 60s...")
                time.sleep(60)
            else:
                logger.error(f"Failed {symbol}: {e}")
        time.sleep(1)

    conn.close()
    logger.info("✅ MIGRATION COMPLETED")

if __name__ == "__main__":
    main()
