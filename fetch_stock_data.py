#!/usr/bin/env python3
"""
Fetch Financial Data V3 - Optimized 3-Table Schema
Saves to: stock_ratios_core, stock_ratios_extended, stock_ratios_banking
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

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
    """Initialize database with optimized 3-table schema"""
    cursor = conn.cursor()
    
    # Companies table (existing)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS companies (
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
    
    # Table 1: Core metrics (always populated, high query frequency)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_ratios_core (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            period_type TEXT NOT NULL,
            year INTEGER NOT NULL,
            quarter INTEGER,
            
            -- Profitability (core)
            roe REAL,
            roa REAL,
            roic REAL,
            net_profit_margin REAL,
            
            -- Per share (core)
            eps REAL,
            bvps REAL,
            
            -- Valuation (core)
            pe REAL,
            pb REAL,
            
            -- Market data
            market_cap REAL,
            outstanding_shares REAL,
            
            -- Capital structure (core)
            financial_leverage REAL,
            equity_to_charter_capital REAL,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(symbol, period_type, year, quarter)
        )
    ''')
    
    # Table 2: Extended metrics (less frequently queried)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_ratios_extended (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            period_type TEXT NOT NULL,
            year INTEGER NOT NULL,
            quarter INTEGER,
            
            -- Capital structure (extended)
            debt_equity REAL,
            fixed_asset_to_equity REAL,
            
            -- Valuation (extended)
            ps REAL,
            p_cashflow REAL,
            ev_ebitda REAL,
            
            -- Liquidity (extended)
            current_ratio REAL,
            quick_ratio REAL,
            cash_ratio REAL,
            interest_coverage REAL,
            
            -- Efficiency (extended)
            asset_turnover REAL,
            inventory_turnover REAL,
            
            -- Profitability (extended)
            gross_profit_margin REAL,
            operating_profit_margin REAL,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(symbol, period_type, year, quarter)
        )
    ''')
    
    # Table 3: Banking-specific (only 27 stocks)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_ratios_banking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            period_type TEXT NOT NULL,
            year INTEGER NOT NULL,
            quarter INTEGER,
            
            -- Banking metrics
            nim REAL,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE(symbol, period_type, year, quarter)
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_core_symbol_year ON stock_ratios_core(symbol, year DESC, quarter DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_core_period ON stock_ratios_core(period_type, year DESC, quarter DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_core_roe ON stock_ratios_core(roe) WHERE roe IS NOT NULL')
    
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_ext_symbol_year ON stock_ratios_extended(symbol, year DESC, quarter DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_banking_symbol ON stock_ratios_banking(symbol, year DESC, quarter DESC)')
    
    conn.commit()
    logger.info("✅ Database V3 initialized successfully.")


def get_ratio_value(df_row, *key_variants, default=None):
    """
    Extract ratio value from dataframe row
    Accepts multiple key variants (English, Vietnamese) and tries all
    """
    try:
        for key in key_variants:
            if key in df_row.index:
                val = df_row[key]
                if pd.notna(val) and val != 0.0:  # Skip 0.0 values
                    if isinstance(val, (int, float)):
                        return float(val)
                    return val
    except Exception as e:
        pass
    return default


def save_ratio_data_v3(conn, symbol: str, period_type: str, year: int, quarter: int, df_row):
    """Save ratio data to 3 optimized tables"""
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
    
    # Insert core data (skip if all major metrics are NULL)
    if core_data['roe'] or core_data['roa'] or core_data['eps']:
        cursor.execute('''
            INSERT OR REPLACE INTO stock_ratios_core (
                symbol, period_type, year, quarter,
                roe, roa, roic, net_profit_margin,
                eps, bvps, pe, pb,
                market_cap, outstanding_shares,
                financial_leverage, equity_to_charter_capital,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            core_data['symbol'], core_data['period_type'], core_data['year'], core_data['quarter'],
            core_data['roe'], core_data['roa'], core_data['roic'], core_data['net_profit_margin'],
            core_data['eps'], core_data['bvps'], core_data['pe'], core_data['pb'],
            core_data['market_cap'], core_data['outstanding_shares'],
            core_data['financial_leverage'], core_data['equity_to_charter_capital']
        ))
    
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
    
    # Insert extended data (only if has data)
    if any([
        ext_data['debt_equity'], ext_data['fixed_asset_to_equity'], 
        ext_data['ps'], ext_data['p_cashflow'], ext_data['ev_ebitda'],
        ext_data['current_ratio'], ext_data['quick_ratio'], ext_data['cash_ratio'],
        ext_data['asset_turnover'], ext_data['inventory_turnover'],
        ext_data['gross_profit_margin'], ext_data['operating_profit_margin']
    ]):
        cursor.execute('''
            INSERT OR REPLACE INTO stock_ratios_extended (
                symbol, period_type, year, quarter,
                debt_equity, fixed_asset_to_equity, ps, p_cashflow, ev_ebitda,
                current_ratio, quick_ratio, cash_ratio, interest_coverage,
                asset_turnover, inventory_turnover,
                gross_profit_margin, operating_profit_margin,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            ext_data['symbol'], ext_data['period_type'], ext_data['year'], ext_data['quarter'],
            ext_data['debt_equity'], ext_data['fixed_asset_to_equity'], ext_data['ps'], ext_data['p_cashflow'], ext_data['ev_ebitda'],
            ext_data['current_ratio'], ext_data['quick_ratio'], ext_data['cash_ratio'], ext_data['interest_coverage'],
            ext_data['asset_turnover'], ext_data['inventory_turnover'],
            ext_data['gross_profit_margin'], ext_data['operating_profit_margin']
        ))
    
    # === Table 3: Banking metrics ===
    nim = get_ratio_value(df_row,
        ('Profitability Ratios', 'NIM (%)'),
        ('Chỉ tiêu khả năng sinh lợi', 'NIM (%)'))
    
    # Only insert if NIM exists (banking stocks only)
    if nim:
        cursor.execute('''
            INSERT OR REPLACE INTO stock_ratios_banking (
                symbol, period_type, year, quarter,
                nim,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (symbol.upper(), period_type, year, quarter, nim))


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


def fetch_stock(symbol: str, db_path: str = 'stocks.db'):
    """Fetch all financial data for a single stock"""
    logger.info(f"\n{'='*60}")
    logger.info(f"📊 Fetching data for {symbol}")
    logger.info(f"{'='*60}")
    
    conn = sqlite3.connect(db_path)
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


def fetch_batch(symbols: list, db_path: str = 'stocks.db', delay: float = 1.0):
    """Fetch data for multiple stocks"""
    logger.info(f"\n{'='*60}")
    logger.info(f"🚀 Batch fetch started: {len(symbols)} stocks")
    logger.info(f"{'='*60}\n")
    
    success_count = 0
    fail_count = 0
    
    for i, symbol in enumerate(symbols, 1):
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                logger.info(f"[{i}/{len(symbols)}] Processing {symbol}...")
                fetch_stock(symbol, db_path)
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
    parser.add_argument('--db', type=str, default='stocks.db', help='Database path')
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
