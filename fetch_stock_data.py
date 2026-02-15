#!/usr/bin/env python3
"""
Fetch Financial Data - Wide Ratio Schema
Saves to: ratio_wide
"""

import sqlite3
import pandas as pd
from vnstock import Vnstock
import logging
import sys
import argparse
from datetime import datetime
import os
from dotenv import load_dotenv
import time
import re

# Ensure project root import works when script is executed directly
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.db_path import resolve_stocks_db_path

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def has_value(value) -> bool:
    """Return True when value is present (including numeric zero)."""
    if value is None:
        return False
    return pd.notna(value)


def get_vnstock_keys() -> list[str]:
    """Load vnstock API keys from environment.

    Supported env vars:
    - VNSTOCK_API_KEY: single key
    - VNSTOCK_API_KEYS: comma-separated keys
    """
    keys: list[str] = []

    single_key = os.getenv('VNSTOCK_API_KEY', '').strip()
    if single_key:
        keys.append(single_key)

    key_list_raw = os.getenv('VNSTOCK_API_KEYS', '').strip()
    if key_list_raw:
        keys.extend([k.strip() for k in key_list_raw.split(',') if k.strip()])

    # Keep unique order
    seen = set()
    unique_keys: list[str] = []
    for key in keys:
        if key not in seen:
            unique_keys.append(key)
            seen.add(key)

    return unique_keys


def set_vnstock_key(api_key: str) -> None:
    """Set active vnstock key for current process."""
    if api_key:
        os.environ['VNSTOCK_API_KEY'] = api_key

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
    
    # Common patterns: "429" or "Too Many Requests"
    if '429' in str(text) or 'too many requests' in str(text).lower():
        return 60  # Default 60s wait
    
    return 0

def init_database_v3(conn):
    """Initialize database with wide ratio schema (single source of truth)."""
    cursor = conn.cursor()
    
    # Companies table (existing)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS company (
            symbol TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            exchange TEXT,
            industry TEXT,
            company_profile TEXT,
            website TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Wide ratio table (mirrors the UI/API needs; single source for ratios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ratio_wide (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            period_type TEXT NOT NULL,
            year INTEGER NOT NULL,
            quarter INTEGER,
            period_label TEXT,

            pe REAL,
            pb REAL,
            ps REAL,
            p_cash_flow REAL,
            ev_ebitda REAL,
            market_cap REAL,
            outstanding_share REAL,
            eps REAL,
            bvps REAL,

            roe REAL,
            roa REAL,
            roic REAL,
            net_profit_margin REAL,
            gross_profit_margin REAL,
            ebit_margin REAL,

            current_ratio REAL,
            quick_ratio REAL,
            cash_ratio REAL,
            interest_coverage REAL,

            financial_leverage REAL,
            debt_equity REAL,
            total_borrowings_equity REAL,
            fixed_asset_to_equity REAL,
            owners_equity_charter_capital REAL,

            asset_turnover REAL,
            inventory_turnover REAL,
            dso REAL,
            dio REAL,
            dpo REAL,
            cash_cycle REAL,
            dividend_yield REAL,

            ebitda REAL,
            ebit REAL,

            nim REAL,
            cof REAL,
            casa_ratio REAL,
            loan_to_deposit REAL,
            npl_ratio REAL,
            loan_loss_reserve REAL,
            cir REAL,

            fetched_at TEXT,

            UNIQUE(symbol, period_type, year, quarter)
        )
    ''')

    # Indexes for common lookups
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ratio_wide_lookup ON ratio_wide(symbol, period_type, year DESC, quarter DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ratio_wide_pe ON ratio_wide(pe) WHERE pe IS NOT NULL')
    
    conn.commit()
    logger.info("✅ Wide ratio schema initialized successfully.")


def get_ratio_value(df_row, *key_variants, default=None):
    """
    Extract ratio value from dataframe row
    Accepts multiple key variants (English, Vietnamese) and tries all
    """
    try:
        for key in key_variants:
            if key in df_row.index:
                val = df_row[key]
                if has_value(val):
                    if isinstance(val, (int, float)):
                        return float(val)
                    return val
    except Exception as e:
        pass
    return default


def save_ratio_data_v3(conn, symbol: str, period_type: str, year: int, quarter: int, df_row):
    """Save ratio data to ratio_wide."""
    cursor = conn.cursor()
    
    # === Table 1: Core metrics ===
    core_data = {
        'symbol': symbol.upper(),
        'period_type': period_type,
        'year': year,
        'quarter': quarter,
        
        # Profitability
        'roe': get_ratio_value(df_row,
            ('Profitability Ratios', 'ROE (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'ROE (%)')),
        'roa': get_ratio_value(df_row,
            ('Profitability Ratios', 'ROA (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'ROA (%)')),
        'roic': get_ratio_value(df_row,
            ('Profitability Ratios', 'ROIC (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'ROIC (%)')),
        'net_profit_margin': get_ratio_value(df_row,
            ('Profitability Ratios', 'Net Profit Margin (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'Net Profit Margin (%)')),
        
        # Per Share
        'eps': get_ratio_value(df_row,
            ('Valuation Ratios', 'EPS (VND)'),
            ('Chỉ tiêu định giá', 'EPS (VND)')),
        'bvps': get_ratio_value(df_row,
            ('Valuation Ratios', 'BVPS (VND)'),
            ('Chỉ tiêu định giá', 'BVPS (VND)')),
        
        # Valuation
        'pe': get_ratio_value(df_row,
            ('Valuation Ratios', 'P/E'),
            ('Chỉ tiêu định giá', 'P/E')),
        'pb': get_ratio_value(df_row,
            ('Valuation Ratios', 'P/B'),
            ('Chỉ tiêu định giá', 'P/B')),
        
        # Market Data
        'market_cap': get_ratio_value(df_row,
            ('Valuation Ratios', 'Market Capital (Bn. VND)'),
            ('Chỉ tiêu định giá', 'Market Capital (Bn. VND)')),
        'outstanding_shares': get_ratio_value(df_row,
            ('Valuation Ratios', 'Outstanding Share (Mil. Shares)'),
            ('Chỉ tiêu định giá', 'Outstanding Share (Mil. Shares)')),
        
        # Capital Structure
        'financial_leverage': get_ratio_value(df_row,
            ('Liquidity Ratios', 'Financial Leverage'),
            ('Chỉ tiêu thanh khoản', 'Financial Leverage')),
        'equity_to_charter_capital': get_ratio_value(df_row,
            ('Capital Structure Ratios', "Owners' Equity/Charter Capital"),
            ('Chỉ tiêu cơ cấu nguồn vốn', "Owners' Equity/Charter Capital")),
    }
    
    # === Extended metrics ===
    
    # === Table 2: Extended metrics ===
    ext_data = {
        'symbol': symbol.upper(),
        'period_type': period_type,
        'year': year,
        'quarter': quarter,
        
        # Capital structure
        'debt_equity': get_ratio_value(df_row,
            ('Capital Structure Ratios', 'Debt/Equity'),
            ('Chỉ tiêu cơ cấu nguồn vốn', 'Debt/Equity')),
        'fixed_asset_to_equity': get_ratio_value(df_row,
            ('Capital Structure Ratios', 'Fixed Asset-To-Equity'),
            ('Chỉ tiêu cơ cấu nguồn vốn', 'Fixed Asset-To-Equity')),
        
        # Valuation
        'ps': get_ratio_value(df_row,
            ('Valuation Ratios', 'P/S'),
            ('Chỉ tiêu định giá', 'P/S')),
        'p_cashflow': get_ratio_value(df_row,
            ('Valuation Ratios', 'P/Cash Flow'),
            ('Chỉ tiêu định giá', 'P/Cash Flow')),
        'ev_ebitda': get_ratio_value(df_row,
            ('Valuation Ratios', 'EV/EBITDA'),
            ('Chỉ tiêu định giá', 'EV/EBITDA')),
        
        # Liquidity
        'current_ratio': get_ratio_value(df_row,
            ('Liquidity Ratios', 'Current Ratio'),
            ('Chỉ tiêu thanh khoản', 'Current Ratio')),
        'quick_ratio': get_ratio_value(df_row,
            ('Liquidity Ratios', 'Quick Ratio'),
            ('Chỉ tiêu thanh khoản', 'Quick Ratio')),
        'cash_ratio': get_ratio_value(df_row,
            ('Liquidity Ratios', 'Cash Ratio'),
            ('Chỉ tiêu thanh khoản', 'Cash Ratio')),
        'interest_coverage': get_ratio_value(df_row,
            ('Liquidity Ratios', 'Interest Coverage'),
            ('Chỉ tiêu thanh khoản', 'Interest Coverage')),
        
        # Efficiency
        'asset_turnover': get_ratio_value(df_row,
            ('Efficiency Ratios', 'Asset Turnover'),
            ('Chỉ tiêu hiệu quả hoạt động', 'Asset Turnover')),
        'inventory_turnover': get_ratio_value(df_row,
            ('Efficiency Ratios', 'Inventory Turnover'),
            ('Chỉ tiêu hiệu quả hoạt động', 'Inventory Turnover')),
        
        # Profitability
        'gross_profit_margin': get_ratio_value(df_row,
            ('Profitability Ratios', 'Gross Profit Margin (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'Gross Profit Margin (%)')),
        'operating_profit_margin': get_ratio_value(df_row,
            ('Profitability Ratios', 'EBIT Margin (%)'),
            ('Chỉ tiêu khả năng sinh lợi', 'EBIT Margin (%)')),
    }
    
    # === Banking metrics (best-effort; not all symbols/periods will have these) ===
    nim = get_ratio_value(
        df_row,
        ('Profitability Ratios', 'NIM (%)'),
        ('Chỉ tiêu khả năng sinh lợi', 'NIM (%)'),
        default=None,
    )
    cof = get_ratio_value(
        df_row,
        ('Profitability Ratios', 'COF (%)'),
        ('Chỉ tiêu khả năng sinh lợi', 'COF (%)'),
        ('Liquidity Ratios', 'COF (%)'),
        ('Chỉ tiêu thanh khoản', 'COF (%)'),
        default=None,
    )
    casa_ratio = get_ratio_value(
        df_row,
        ('Liquidity Ratios', 'CASA (%)'),
        ('Chỉ tiêu thanh khoản', 'CASA (%)'),
        ('Profitability Ratios', 'CASA (%)'),
        ('Chỉ tiêu khả năng sinh lợi', 'CASA (%)'),
        default=None,
    )
    loan_to_deposit = get_ratio_value(
        df_row,
        ('Liquidity Ratios', 'LDR (%)'),
        ('Chỉ tiêu thanh khoản', 'LDR (%)'),
        ('Liquidity Ratios', 'Loan to Deposit (%)'),
        ('Chỉ tiêu thanh khoản', 'Loan to Deposit (%)'),
        default=None,
    )
    npl_ratio = get_ratio_value(
        df_row,
        ('Asset Quality Ratios', 'NPL (%)'),
        ('Chỉ tiêu chất lượng tài sản', 'NPL (%)'),
        ('Profitability Ratios', 'NPL (%)'),
        ('Chỉ tiêu khả năng sinh lợi', 'NPL (%)'),
        default=None,
    )
    cir = get_ratio_value(
        df_row,
        ('Efficiency Ratios', 'CIR (%)'),
        ('Chỉ tiêu hiệu quả hoạt động', 'CIR (%)'),
        ('Efficiency Ratios', 'C/I Ratio (%)'),
        ('Chỉ tiêu hiệu quả hoạt động', 'C/I Ratio (%)'),
        default=None,
    )

    # Period label (for convenience)
    if period_type == 'quarter' and quarter:
        period_label = f"Q{int(quarter)} '{str(year)[-2:]}"
    else:
        period_label = str(year)

    # Insert into ratio_wide (single source of truth)
    # Only write a row when we have at least some meaningful metrics.
    if any([
        has_value(core_data['roe']),
        has_value(core_data['roa']),
        has_value(core_data['pe']),
        has_value(core_data['pb']),
        has_value(core_data['eps']),
        has_value(ext_data['ps']),
        has_value(ext_data['current_ratio']),
        has_value(nim),
    ]):
        cursor.execute(
            '''
            INSERT INTO ratio_wide (
                symbol, period_type, year, quarter, period_label,
                pe, pb, ps, p_cash_flow, ev_ebitda, market_cap, outstanding_share, eps, bvps,
                roe, roa, roic, net_profit_margin, gross_profit_margin, ebit_margin,
                current_ratio, quick_ratio, cash_ratio, interest_coverage,
                financial_leverage, debt_equity, fixed_asset_to_equity, owners_equity_charter_capital,
                asset_turnover, inventory_turnover,
                nim, cof, casa_ratio, loan_to_deposit, npl_ratio, cir,
                fetched_at
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?, ?, ?,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT(symbol, period_type, year, quarter)
            DO UPDATE SET
                period_label = excluded.period_label,
                pe = COALESCE(excluded.pe, ratio_wide.pe),
                pb = COALESCE(excluded.pb, ratio_wide.pb),
                ps = COALESCE(excluded.ps, ratio_wide.ps),
                p_cash_flow = COALESCE(excluded.p_cash_flow, ratio_wide.p_cash_flow),
                ev_ebitda = COALESCE(excluded.ev_ebitda, ratio_wide.ev_ebitda),
                market_cap = COALESCE(excluded.market_cap, ratio_wide.market_cap),
                outstanding_share = COALESCE(excluded.outstanding_share, ratio_wide.outstanding_share),
                eps = COALESCE(excluded.eps, ratio_wide.eps),
                bvps = COALESCE(excluded.bvps, ratio_wide.bvps),
                roe = COALESCE(excluded.roe, ratio_wide.roe),
                roa = COALESCE(excluded.roa, ratio_wide.roa),
                roic = COALESCE(excluded.roic, ratio_wide.roic),
                net_profit_margin = COALESCE(excluded.net_profit_margin, ratio_wide.net_profit_margin),
                gross_profit_margin = COALESCE(excluded.gross_profit_margin, ratio_wide.gross_profit_margin),
                ebit_margin = COALESCE(excluded.ebit_margin, ratio_wide.ebit_margin),
                current_ratio = COALESCE(excluded.current_ratio, ratio_wide.current_ratio),
                quick_ratio = COALESCE(excluded.quick_ratio, ratio_wide.quick_ratio),
                cash_ratio = COALESCE(excluded.cash_ratio, ratio_wide.cash_ratio),
                interest_coverage = COALESCE(excluded.interest_coverage, ratio_wide.interest_coverage),
                financial_leverage = COALESCE(excluded.financial_leverage, ratio_wide.financial_leverage),
                debt_equity = COALESCE(excluded.debt_equity, ratio_wide.debt_equity),
                fixed_asset_to_equity = COALESCE(excluded.fixed_asset_to_equity, ratio_wide.fixed_asset_to_equity),
                owners_equity_charter_capital = COALESCE(excluded.owners_equity_charter_capital, ratio_wide.owners_equity_charter_capital),
                asset_turnover = COALESCE(excluded.asset_turnover, ratio_wide.asset_turnover),
                inventory_turnover = COALESCE(excluded.inventory_turnover, ratio_wide.inventory_turnover),
                nim = COALESCE(excluded.nim, ratio_wide.nim),
                cof = COALESCE(excluded.cof, ratio_wide.cof),
                casa_ratio = COALESCE(excluded.casa_ratio, ratio_wide.casa_ratio),
                loan_to_deposit = COALESCE(excluded.loan_to_deposit, ratio_wide.loan_to_deposit),
                npl_ratio = COALESCE(excluded.npl_ratio, ratio_wide.npl_ratio),
                cir = COALESCE(excluded.cir, ratio_wide.cir),
                fetched_at = excluded.fetched_at
            ''',
            (
                symbol.upper(),
                period_type,
                int(year),
                int(quarter) if quarter is not None else None,
                period_label,

                core_data['pe'],
                core_data['pb'],
                ext_data['ps'],
                ext_data['p_cashflow'],
                ext_data['ev_ebitda'],
                core_data['market_cap'],
                core_data['outstanding_shares'],
                core_data['eps'],
                core_data['bvps'],

                core_data['roe'],
                core_data['roa'],
                core_data['roic'],
                core_data['net_profit_margin'],
                ext_data['gross_profit_margin'],
                ext_data['operating_profit_margin'],

                ext_data['current_ratio'],
                ext_data['quick_ratio'],
                ext_data['cash_ratio'],
                ext_data['interest_coverage'],

                core_data['financial_leverage'],
                ext_data['debt_equity'],
                ext_data['fixed_asset_to_equity'],
                core_data['equity_to_charter_capital'],

                ext_data['asset_turnover'],
                ext_data['inventory_turnover'],

                nim,
                cof,
                casa_ratio,
                loan_to_deposit,
                npl_ratio,
                cir,
            ),
        )


def fetch_stock_ratios(stock, symbol: str, period_type: str, conn):
    """Fetch and save ratio data for a stock"""
    try:
        logger.info(f"  Fetching {period_type} ratios for {symbol}...")
        
        # Fetch ratio data with English field names
        df = stock.finance.ratio(period=period_type, lang='en', dropna=True)
        
        if df.empty:
            logger.warning(f"    No ratio data returned for {symbol} ({period_type})")
            return 0
        
        saved_count = 0
        
        # Process each period (row)
        for idx, row in df.iterrows():
            # Get period info from multi-index columns
            year = row.get(('Meta', 'yearReport')) if ('Meta', 'yearReport') in row.index else None
            quarter = row.get(('Meta', 'lengthReport')) if ('Meta', 'lengthReport') in row.index else None
            
            if not year:
                logger.warning(f"    Skipping row without year info")
                continue
            
            # Save to 3 tables
            save_ratio_data_v3(conn, symbol, period_type, int(year), int(quarter) if quarter else None, row)
            saved_count += 1
        
        logger.info(f"    ✅ Saved {saved_count} {period_type} records")
        return saved_count
        
    except Exception as e:
        logger.error(f"    ❌ Error fetching ratios for {symbol}: {e}")
        return 0


def fetch_stock(symbol: str, db_path: str = None, api_key: str | None = None):
    """Fetch all financial data for a single stock"""
    logger.info(f"\n{'='*60}")
    logger.info(f"📊 Fetching data for {symbol}")
    logger.info(f"{'='*60}")
    
    resolved_db = db_path or resolve_stocks_db_path()
    if api_key:
        set_vnstock_key(api_key)

    conn = sqlite3.connect(resolved_db)
    init_database_v3(conn)
    
    try:
        stock = Vnstock().stock(symbol=symbol, source='VCI')
        
        # Fetch quarterly ratios
        q_count = fetch_stock_ratios(stock, symbol, 'quarter', conn)
        
        # Fetch yearly ratios
        y_count = fetch_stock_ratios(stock, symbol, 'year', conn)
        
        conn.commit()
        logger.info(f"\n✅ {symbol}: {q_count} quarterly + {y_count} yearly records saved")
        
    except Exception as e:
        logger.error(f"❌ Error processing {symbol}: {e}")
        conn.rollback()
    finally:
        conn.close()


def fetch_batch(symbols: list, db_path: str = None, delay: float = 1.0):
    """Fetch data for multiple stocks"""
    logger.info(f"\n{'='*60}")
    logger.info(f"🚀 Batch fetch started: {len(symbols)} stocks")
    logger.info(f"{'='*60}\n")
    
    success_count = 0
    fail_count = 0
    vnstock_keys = get_vnstock_keys()

    if vnstock_keys:
        logger.info(f"🔑 Loaded {len(vnstock_keys)} vnstock API key(s) for rotation")
    else:
        logger.warning("⚠️ No VNSTOCK_API_KEY(S) found in environment; vnstock requests may fail")
    
    for i, symbol in enumerate(symbols, 1):
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                # Rotate key by stock index + retry count
                active_key = None
                if vnstock_keys:
                    key_index = (i - 1 + retry_count) % len(vnstock_keys)
                    active_key = vnstock_keys[key_index]
                    set_vnstock_key(active_key)

                logger.info(f"[{i}/{len(symbols)}] Processing {symbol}...")
                fetch_stock(symbol, db_path, api_key=active_key)
                success_count += 1
                
                # Rate limiting
                if i < len(symbols):
                    time.sleep(delay)
                
                break  # Success, exit retry loop
                    
            except Exception as e:
                # Check for rate limit
                wait_time = check_rate_limit_message(str(e))
                
                if wait_time > 0:
                    logger.warning(f"⚠️  Rate limit detected for {symbol}. Waiting {wait_time}s...")
                    time.sleep(wait_time + 2)  # Add 2s buffer
                    retry_count += 1
                    
                    if retry_count < max_retries:
                        logger.info(f"🔄 Retrying {symbol} (attempt {retry_count + 1}/{max_retries})...")
                    else:
                        logger.error(f"❌ Failed {symbol} after {max_retries} retries: Rate limit")
                        fail_count += 1
                else:
                    # Other error, don't retry
                    logger.error(f"❌ Failed to process {symbol}: {e}")
                    fail_count += 1
                    break
    
    logger.info(f"\n{'='*60}")
    logger.info(f"📊 Batch fetch completed")
    logger.info(f"{'='*60}")
    logger.info(f"✅ Success: {success_count}")
    logger.info(f"❌ Failed: {fail_count}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Fetch financial data V3 (optimized 3-table schema)')
    parser.add_argument('--symbol', type=str, help='Stock symbol to fetch')
    parser.add_argument('--symbols', type=str, nargs='+', help='Multiple stock symbols')
    parser.add_argument('--file', type=str, help='File containing stock symbols (one per line)')
    parser.add_argument('--db', type=str, default=resolve_stocks_db_path(), help='Database path')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay between requests (seconds)')
    
    args = parser.parse_args()
    
    symbols_to_fetch = []
    
    if args.symbol:
        symbols_to_fetch = [args.symbol]
    elif args.symbols:
        symbols_to_fetch = args.symbols
    elif args.file:
        with open(args.file, 'r') as f:
            symbols_to_fetch = [line.strip().upper() for line in f if line.strip()]
    else:
        # Default: fetch some banking stocks to test NIM
        symbols_to_fetch = ['ACB', 'VCB', 'CTG', 'MBB', 'FPT', 'VIC']
        logger.info("No symbols specified, using default test list")
    
    if symbols_to_fetch:
        fetch_batch(symbols_to_fetch, args.db, args.delay)
    else:
        logger.error("No symbols to fetch!")
        sys.exit(1)
