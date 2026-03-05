import sqlite3
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any

class FinancialRepository:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_latest_ratios(self, symbol: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            # Note: quarter=0 or quarter=5 often means yearly in this DB schema for ratios
            query = """
                SELECT * FROM financial_ratios 
                WHERE symbol = ? AND (quarter = 0 OR quarter = 5 OR quarter IS NULL)
                ORDER BY year DESC 
                LIMIT 1
            """
            row = conn.execute(query, (symbol.upper(),)).fetchone()
            return dict(row) if row else None

    def get_financial_reports(self, symbol: str, period: str = 'year', limit: int = 5) -> Dict[str, pd.DataFrame]:
        with self._get_connection() as conn:
            reports = {}
            for table in ['income_statement', 'balance_sheet', 'cash_flow_statement']:
                if period == 'year':
                    period_filter = "(quarter = 0 OR quarter IS NULL)"
                else:
                    period_filter = "quarter > 0"
                    
                query = f"""
                    SELECT * FROM {table}
                    WHERE symbol = ? AND {period_filter}
                    ORDER BY year DESC, quarter DESC
                    LIMIT ?
                """
                reports[table] = pd.read_sql_query(query, conn, params=(symbol, limit))
            return reports

    def get_stock_industry(self, symbol: str) -> Optional[str]:
        """Get the industry name for a symbol."""
        with self._get_connection() as conn:
            query = "SELECT icb_name4 FROM stock_industry WHERE ticker = ? LIMIT 1"
            row = conn.execute(query, (symbol.upper(),)).fetchone()
            return row[0] if row else None

    def get_industry_peers(self, symbol: str, limit: int = 15) -> Dict[str, Any]:
        """Get top peers in the same industry with their latest ratios."""
        industry = self.get_stock_industry(symbol)
        if not industry:
            return {'sector': 'N/A', 'peers_detail': [], 'median_pe': 0, 'median_pb': 0}

        with self._get_connection() as conn:
            # Get latest ratios for all stocks in the same industry
            # Filter by market cap to get the biggest/most relevant peers
            query = """
                WITH latest_ratios AS (
                    SELECT 
                        fr.symbol, 
                        fr.price_to_earnings as pe_ratio, 
                        fr.price_to_book as pb_ratio,
                        fr.market_cap_billions as market_cap,
                        ROW_NUMBER() OVER (PARTITION BY fr.symbol ORDER BY fr.year DESC) as rn
                    FROM financial_ratios fr
                    JOIN stock_industry si ON fr.symbol = si.ticker
                    WHERE si.icb_name4 = ? AND (fr.quarter = 0 OR fr.quarter = 5 OR fr.quarter IS NULL)
                )
                SELECT symbol, pe_ratio, pb_ratio, market_cap
                FROM latest_ratios
                WHERE rn = 1
                ORDER BY market_cap DESC
                LIMIT ?
            """
            rows = conn.execute(query, (industry, limit)).fetchall()
            peers = [dict(r) for r in rows]
            
            # Calculate medians (excluding zeros/negatives)
            pe_values = [p['pe_ratio'] for p in peers if p.get('pe_ratio') and p['pe_ratio'] > 0]
            pb_values = [p['pb_ratio'] for p in peers if p.get('pb_ratio') and p['pb_ratio'] > 0]
            
            median_pe = float(np.median(pe_values)) if pe_values else 0
            median_pb = float(np.median(pb_values)) if pb_values else 0
            
            return {
                'sector': industry,
                'peers_detail': peers,
                'median_pe': median_pe,
                'median_pb': median_pb
            }
