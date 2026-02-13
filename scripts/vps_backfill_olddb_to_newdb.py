#!/usr/bin/env python3
import argparse
import sqlite3


def resolve_table_name(conn: sqlite3.Connection, preferred: str, legacy: str) -> str:
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (preferred,))
    if cur.fetchone():
        return preferred
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (legacy,))
    if cur.fetchone():
        return legacy
    return preferred


def ensure_companies_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS companies (
            symbol TEXT PRIMARY KEY,
            name TEXT,
            exchange TEXT,
            industry TEXT,
            company_profile TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )


def ensure_stock_overview_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS stock_overview (
            symbol TEXT PRIMARY KEY,
            exchange TEXT,
            industry TEXT,
            pe REAL,
            pb REAL,
            ps REAL,
            pcf REAL,
            ev_ebitda REAL,
            eps_ttm REAL,
            bvps REAL,
            dividend_per_share REAL,
            roe REAL,
            roa REAL,
            roic REAL,
            net_profit_margin REAL,
            profit_growth REAL,
            gross_margin REAL,
            operating_margin REAL,
            current_ratio REAL,
            quick_ratio REAL,
            cash_ratio REAL,
            debt_to_equity REAL,
            interest_coverage REAL,
            asset_turnover REAL,
            inventory_turnover REAL,
            receivables_turnover REAL,
            revenue REAL,
            net_income REAL,
            total_assets REAL,
            total_equity REAL,
            total_debt REAL,
            cash REAL,
            market_cap REAL,
            shares_outstanding REAL,
            current_price REAL,
            overview_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            nim REAL
        )
        '''
    )


def main() -> None:
    parser = argparse.ArgumentParser(description='Backfill NIM + overview/company tables from old stocks.db to new fetched DB')
    parser.add_argument('--old-db', required=True)
    parser.add_argument('--new-db', required=True)
    args = parser.parse_args()

    conn = sqlite3.connect(args.new_db)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute("ATTACH DATABASE ? AS olddb", (args.old_db,))

    ratio_wide_table = resolve_table_name(conn, 'stock_ratio_wide_periods', 'financial_ratio_wide_periods')
    ratio_summary_table = resolve_table_name(conn, 'stock_company_ratio_snapshot', 'company_ratio_summary_snapshot')

    ensure_companies_table(conn)
    ensure_stock_overview_table(conn)

    conn.execute(
        '''
        INSERT OR REPLACE INTO companies(symbol, name, exchange, industry, company_profile, updated_at)
        SELECT symbol, name, exchange, industry, company_profile, updated_at
        FROM olddb.companies
        '''
    )

    conn.execute(
        '''
        INSERT OR REPLACE INTO stock_overview(
            symbol, exchange, industry, pe, pb, ps, pcf, ev_ebitda, eps_ttm, bvps,
            dividend_per_share, roe, roa, roic, net_profit_margin, profit_growth,
            gross_margin, operating_margin, current_ratio, quick_ratio, cash_ratio,
            debt_to_equity, interest_coverage, asset_turnover, inventory_turnover,
            receivables_turnover, revenue, net_income, total_assets, total_equity,
            total_debt, cash, market_cap, shares_outstanding, current_price,
            overview_json, updated_at, nim
        )
        SELECT
            symbol, exchange, industry, pe, pb, ps, pcf, ev_ebitda, eps_ttm, bvps,
            dividend_per_share, roe, roa, roic, net_profit_margin, profit_growth,
            gross_margin, operating_margin, current_ratio, quick_ratio, cash_ratio,
            debt_to_equity, interest_coverage, asset_turnover, inventory_turnover,
            receivables_turnover, revenue, net_income, total_assets, total_equity,
            total_debt, cash, market_cap, shares_outstanding, current_price,
            overview_json, updated_at, nim
        FROM olddb.stock_overview
        '''
    )

    conn.execute(
        f'''
        UPDATE {ratio_wide_table} AS fr
        SET nim = COALESCE(
            fr.nim,
            (
                SELECT b.nim
                FROM olddb.stock_ratios_banking b
                WHERE b.symbol = fr.symbol
                  AND b.period_type = fr.period_type
                  AND b.year = fr.year
                  AND ((b.quarter IS NULL AND fr.quarter IS NULL) OR b.quarter = fr.quarter)
                LIMIT 1
            )
        )
        WHERE fr.nim IS NULL
        '''
    )

    conn.execute(
        f'''
        UPDATE {ratio_summary_table} AS s
        SET nim = COALESCE(
            s.nim,
            (
                SELECT so.nim
                FROM olddb.stock_overview so
                WHERE so.symbol = s.symbol
                LIMIT 1
            ),
            (
                SELECT b.nim
                FROM olddb.stock_ratios_banking b
                WHERE b.symbol = s.symbol
                ORDER BY b.year DESC, COALESCE(b.quarter, 0) DESC
                LIMIT 1
            )
        )
        WHERE s.nim IS NULL
        '''
    )

    cur = conn.cursor()
    cur.execute(f'SELECT COUNT(*) FROM {ratio_wide_table} WHERE nim IS NOT NULL')
    nim_rows = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM companies')
    companies_count = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM stock_overview')
    overview_count = cur.fetchone()[0]

    conn.commit()
    conn.close()

    print('backfill_done')
    print('nim_non_null_rows', nim_rows)
    print('companies_rows', companies_count)
    print('stock_overview_rows', overview_count)


if __name__ == '__main__':
    main()
