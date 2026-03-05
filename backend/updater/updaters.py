import os
import pandas as pd
import json
import logging
import time
import re
import sqlite3
import traceback
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Literal
from .database import StockDatabase

try:
    from vnstock import Vnstock
except ImportError:
    Vnstock = None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Monkey-patch: VCI Company API recently changed its response format.
# Both Company._fetch_data and Finance._get_company_type call the VCI API
# and fail with KeyError when the response format changes or quota is exceeded.
# We patch them to return safe defaults so Finance (which uses a DIFFERENT
# endpoint for actual financial data) can still fetch balance_sheet etc.
# ---------------------------------------------------------------------------
def _patch_vci_company() -> None:
    try:
        # 1. Patch Company._fetch_data → return {} on failure
        from vnstock.explorer.vci import company as _vci_co_mod
        _orig_fetch = _vci_co_mod.Company._fetch_data

        def _safe_fetch(self):
            try:
                return _orig_fetch(self)
            except Exception as exc:
                logger.debug(
                    "VCI Company._fetch_data patched-fallback for %s: %s",
                    getattr(self, "symbol", "?"), exc,
                )
                return {}

        _vci_co_mod.Company._fetch_data = _safe_fetch

        # 2. Patch Finance._get_company_type → return 'CT' (generic) on failure
        #    com_type_code values: 'CT' company  'CK' securities  'NH' bank  'BH' insurance
        from vnstock.explorer.vci import financial as _vci_fin_mod
        _orig_type = _vci_fin_mod.Finance._get_company_type

        def _safe_get_type(self):
            try:
                return _orig_type(self)
            except Exception as exc:
                logger.debug(
                    "VCI Finance._get_company_type patched-fallback for %s: %s → 'CT'",
                    getattr(self, "symbol", "?"), exc,
                )
                return "CT"

        _vci_fin_mod.Finance._get_company_type = _safe_get_type

        logger.debug("VCI Company + Finance monkey-patches applied.")
    except Exception as exc:
        logger.warning("Could not apply VCI monkey-patches: %s", exc)

_patch_vci_company()

# ============================================================================
# RATE LIMITER
# ============================================================================

class RateLimiter:
    def __init__(self, requests_per_minute: int = 30):
        self.limit = requests_per_minute
        self.delay = max(1.2, 60.0 / requests_per_minute)  # min 1.2s between calls
        self.count = 0
        self.last_reset = datetime.now()

    def check(self):
        now = datetime.now()
        if (now - self.last_reset).total_seconds() >= 60:
            self.count = 0
            self.last_reset = now

        if self.count >= self.limit - 1:
            wait = 60 - (now - self.last_reset).total_seconds()
            if wait > 0:
                logger.info(f"Rate limit reached, waiting {wait:.1f}s")
                time.sleep(wait)
            self.count = 0
            self.last_reset = datetime.now()

        time.sleep(self.delay)
        self.count += 1

# ============================================================================
# UPDATER BASE
# ============================================================================

# How many days since last update before we re-fetch a symbol's financials
SKIP_IF_UPDATED_WITHIN_DAYS = int(
    os.environ.get("SKIP_IF_UPDATED_WITHIN_DAYS", "30")
)


class BaseUpdater:
    def __init__(self, db_conn, requests_per_minute: int = 30):
        self.conn = db_conn
        self.limiter = RateLimiter(requests_per_minute)
        self.vnstock = Vnstock() if Vnstock else None

    def _was_recently_updated(self, symbol: str, table: str) -> bool:
        """Return True if *symbol* in *table* was updated within SKIP_IF_UPDATED_WITHIN_DAYS."""
        try:
            cutoff = (datetime.now() - timedelta(days=SKIP_IF_UPDATED_WITHIN_DAYS)).isoformat()
            row = self.conn.execute(
                f"SELECT updated_at FROM {table} WHERE symbol=? ORDER BY updated_at DESC LIMIT 1",
                (symbol,),
            ).fetchone()
            if row and row[0] and row[0] >= cutoff:
                return True
        except Exception:
            pass
        return False

# ============================================================================
# FINANCIAL UPDATER
# ============================================================================

class FinancialUpdater(BaseUpdater):
    # ------------------------------------------------------------------
    # KBS source: maps item_id (stable English slug) → DB column name.
    # KBS returns wide-format DataFrames: rows = line items, cols = years.
    # ------------------------------------------------------------------
    BALANCE_SHEET_MAPPING_KBS = {
        'a.short_term_assets':                    'asset_current',
        'i.cash_and_cash_equivalents':            'cash_and_equivalents',
        'ii.short_term_financial_investments':    'short_term_investments',
        'iii.short_term_receivables':             'accounts_receivable',
        'iv.inventories':                         'inventory',
        'v.other_short_term_assets':              'current_assets_other',
        'b.long_term_assets':                     'asset_non_current',
        'i.long_term_receivables':               'long_term_receivables',
        'ii.fixed_assets':                        'fixed_assets',
        'v.long_term_financial_investments':      'long_term_investments',
        'vi.other_long_term_assets':              'non_current_assets_other',
        'total_assets':                           'total_assets',
        'a.liabilities':                          'liabilities_total',
        'i.short_term_liabilities':              'liabilities_current',
        'ii.long_term_liabilities':              'liabilities_non_current',
        'b.owners_equity':                        'equity_total',
        'n_1.owners_capital':                     'share_capital',
        'n_11.undistributed_earnings_after_tax':  'retained_earnings',
        'n_4.other_capital_of_owners':            'equity_other',
        'total_owners_equity_and_liabilities':   'total_equity_and_liabilities',
    }

    INCOME_STATEMENT_MAPPING_KBS = {
        # ── Standard / Corporate ─────────────────────────────────────────────
        'n_1.revenue':                                           'revenue',
        'n_3.net_revenue':                                       'net_revenue',
        'n_4.cost_of_goods_sold':                                'cost_of_goods_sold',
        'n_5.gross_profit':                                      'gross_profit',
        'n_6.financial_income':                                  'financial_income',
        'n_7.financial_expenses':                                'financial_expense',
        'n_11.operating_profit':                                 'operating_profit',
        'n_12.other_income':                                     'other_income',
        'n_15.profit_before_tax':                                'profit_before_tax',
        'n_16.current_corporate_income_tax_expenses':            'corporate_income_tax',
        'n_17.deferred_income_tax_expenses':                     'deferred_income_tax',
        'n_18.net_profit_after_tax':                             'net_profit',
        'minoritys_interest':                                    'minority_interest',
        'profit_after_tax_for_shareholders_of_parent_company':   'net_profit_parent_company',
        'n_19.earnings_per_share_vnd':                           'eps',
        # ── Banks (NH) ────────────────────────────────────────────────────────
        'n_1.interest_income_and_similar_income':                'revenue',
        'i.net_interest_income':                                 'net_revenue',
        'ix.operating_profit_before_provision_for_credit_losses': 'operating_profit',
        'viii.operating_expenses':                               'operating_expenses',
        'xi.profit_before_tax':                                  'profit_before_tax',
        'xii.corporate_income_tax':                              'corporate_income_tax',
        'n_8.deferred_income_tax_expenses':                      'deferred_income_tax',
        'xiii.net_profit_after_tax':                             'net_profit',
        'xiv.minority_interest':                                 'minority_interest',
        'xv.net_profit_atttributable_to_the_equity_holders_of_the_bank': 'net_profit_parent_company',
        'earning_per_share_vnd':                                 'eps',
        # ── Securities (CK) ──────────────────────────────────────────────────
        'revenue_from_securities_business_01_11':                'revenue',
        'net_sales':                                             'net_revenue',
        'gross_profit':                                          'gross_profit',
        'total_financial_income_41_44':                          'financial_income',
        'total_financial_expenses_51_54':                        'financial_expense',
        'operating_expenses_21_33':                              'operating_expenses',
        'ix.profit_before_tax':                                  'profit_before_tax',
        'corporate_income_tax':                                  'corporate_income_tax',
        'n_10.2.deferred_income_tax_expenses':                   'deferred_income_tax',
        'xi.net_profit_after_tax':                               'net_profit',
        'n_11.3.profit_after_tax_attribute_to_non_controling_interest': 'minority_interest',
        'n_11.1.profit_after_tax_for_shareholders_of_the_parents_company': 'net_profit_parent_company',
        'n_13.1.earning_per_share_vnd':                          'eps',
    }

    CASH_FLOW_MAPPING_KBS = {
        'n_1.profit_before_tax':                                                      'profit_before_tax',
        'depreciation_of_fixed_assets_and_properties_investment':                     'depreciation_fixed_assets',
        'reversal_of_provisions_provisions':                                          'provision_credit_loss_real_estate',
        'loss_profits_from_disposal_of_fixed_asset':                                  'profit_loss_from_disposal_fixed_assets',
        'loss_profit_from_investment_activities':                                     'profit_loss_investment_activities',
        'interest_expense':                                                           'interest_income',
        'n_3.operating_profit_before_changes_in_working_capital':                    'net_cash_flow_from_operating_activities_before_working_capital',
        'increase_decrease_in_receivables':                                           'increase_decrease_receivables',
        'increase_decrease_in_inventories':                                           'increase_decrease_inventory',
        'increase_decrease_in_payables_other_than_interest_corporate_income_tax':     'increase_decrease_payables',
        'increase_decrease_in_prepaid_expenses':                                      'increase_decrease_prepaid_expenses',
        'interest_paid':                                                              'interest_expense_paid',
        'corporate_income_tax_paid':                                                  'corporate_income_tax_paid',
        'other_receipts_from_operating_activities':                                   'other_cash_from_operating_activities',
        'other_payments_for_operating_activities':                                    'other_cash_paid_for_operating_activities',
        'net_cash_flows_from_operating_activities':                                   'net_cash_from_operating_activities',
        'n_1.payment_for_fixed_assets_constructions_and_other_long_term_assets':     'purchase_purchase_fixed_assets',
        'n_2.receipts_from_disposal_of_fixed_assets_and_other_long_term_assets':     'proceeds_from_disposal_fixed_assets',
        'n_4.receipts_from_loan_repayments_sale_of_other_entities_debt_instruments': 'loans_other_collections',
        'n_5.payments_for_investment_in_other_entities':                             'investments_other_companies',
        'n_6.collections_on_investment_in_other_entities':                           'proceeds_from_sale_investments_other_companies',
        'n_7.dividends_interest_and_profit_received':                                'dividends_and_profits_received',
        'net_cash_flows_from_investing_activities':                                   'net_cash_from_investing_activities',
        'n_1.receipts_from_equity_issue_and_owners_capital_contribution':            'increase_share_capital_contribution_equity',
        'n_2.payment_for_share_repurchases':                                         'payment_for_capital_contribution_buyback_shares',
        'n_3.proceeds_from_borrowings':                                              'proceeds_from_borrowings',
        'n_4_principal_repayments':                                                  'repayments_of_borrowings',
        'n_5.repayment_of_financial_leases':                                         'lease_principal_payments',
        'n_6.dividends_paid_profits_distributed_to_owners':                          'dividends_paid',
        'net_cash_flows_from_financing_activities':                                   'net_cash_from_financing_activities',
        'net_cash_flows_during_the_period':                                           'net_cash_flow_period',
        'cash_and_cash_equivalents_at_beginning_of_the_period':                      'cash_and_cash_equivalents_beginning',
        'cash_and_cash_equivalents_at_end_of_the_period':                            'cash_and_cash_equivalents_ending',
    }

    def _parse_kbs_period_col(self, col: str):
        """Return (year, quarter) from a KBS period column name.

        Annual:    '2024'        → (2024, None)
        Quarterly: 'Q1 2024'    → (2024, 1)
                   '2024Q1'     → (2024, 1)
                   'Q1/2024'    → (2024, 1)
        """
        col = str(col).strip()
        if re.match(r'^\d{4}$', col):
            return int(col), None
        m = re.match(r'Q(\d)[/ ](\d{4})', col)
        if m:
            return int(m.group(2)), int(m.group(1))
        m = re.match(r'(\d{4})[/ ]?Q(\d)', col)
        if m:
            return int(m.group(1)), int(m.group(2))
        return None, None

    def _upsert_kbs_rows(self, df: pd.DataFrame, table: str, mapping: dict,
                         symbol: str, period: str) -> int:
        """Upsert KBS wide-format data (rows=items, cols=year/quarter periods)."""
        if df is None or df.empty:
            return 0
        # Index by item_id; drop duplicates to avoid ambiguous .loc lookups
        df_idx = df.drop_duplicates(subset='item_id').set_index('item_id')
        period_cols = [c for c in df_idx.columns if c not in ('item', 'unit')]
        count = 0
        now = datetime.now().isoformat()
        for col in period_cols:
            year, quarter = self._parse_kbs_period_col(col)
            if year is None:
                continue
            record = {}
            for item_id, db_col in mapping.items():
                if item_id in df_idx.index:
                    val = df_idx.loc[item_id, col]
                    record[db_col] = float(val) if pd.notna(val) else None
            if not record:
                continue
            self.conn.execute(
                f"DELETE FROM {table} WHERE symbol=? AND year=? AND (quarter IS ? OR quarter=?)",
                (symbol, year, quarter, quarter),
            )
            cols = ['symbol', 'period', 'year', 'quarter', 'source', 'updated_at'] + list(record.keys())
            vals = [symbol, period, year, quarter, 'KBS', now] + list(record.values())
            sql = (
                f"INSERT INTO {table} ({','.join(cols)}) "
                f"VALUES ({','.join(['?'] * len(vals))})"
            )
            self.conn.execute(sql, vals)
            count += 1
        return count

    def update_stock(self, symbol: str, period: str = 'year') -> dict:
        if not self.vnstock:
            logger.error("Vnstock library not available")
            return {}

        # Smart-skip: don't re-fetch if recently updated
        if self._was_recently_updated(symbol, 'balance_sheet'):
            logger.info(f"  ⊙ Skip {symbol} (balance_sheet updated < {SKIP_IF_UPDATED_WITHIN_DAYS}d ago)")
            return {}

        logger.info(f"  → Fetching BCTC: {symbol} ({period})")
        results: dict = {}
        # KBS uses 'year' for annual; 'quarter' for quarterly (same as our default)
        kbs_period = 'year' if period in ('year', 'annual') else 'quarter'
        try:
            # Rate-limit BEFORE creating stock object (which may make an API call)
            self.limiter.check()
            stock = self.vnstock.stock(symbol=symbol, source='KBS')

            # 1. Balance Sheet
            bs_df = stock.finance.balance_sheet(period=kbs_period, display_mode='vi')
            if bs_df is not None and not bs_df.empty:
                n = self._upsert_kbs_rows(bs_df, 'balance_sheet', self.BALANCE_SHEET_MAPPING_KBS, symbol, period)
                results['balance_sheet'] = n
                logger.debug(f"    balance_sheet: {n} rows")

            # 2. Income Statement
            self.limiter.check()
            is_df = stock.finance.income_statement(period=kbs_period, display_mode='vi')
            if is_df is not None and not is_df.empty:
                n = self._upsert_kbs_rows(is_df, 'income_statement', self.INCOME_STATEMENT_MAPPING_KBS, symbol, period)
                results['income_statement'] = n
                logger.debug(f"    income_statement: {n} rows")

            # 3. Cash Flow Statement
            self.limiter.check()
            cf_df = stock.finance.cash_flow(period=kbs_period, display_mode='vi')
            if cf_df is not None and not cf_df.empty:
                n = self._upsert_kbs_rows(cf_df, 'cash_flow_statement', self.CASH_FLOW_MAPPING_KBS, symbol, period)
                results['cash_flow_statement'] = n
                logger.debug(f"    cash_flow: {n} rows")

            self.conn.commit()
            total = sum(results.values())
            if total:
                logger.info(f"  ✓ {symbol}: {total} rows written ({', '.join(f'{k}={v}' for k,v in results.items())})")
            else:
                logger.info(f"  ⊙ {symbol}: API returned no new rows (data up to date)")

        except Exception as exc:
            self.conn.rollback()
            logger.error(
                f"  ✗ Error updating {symbol}: {exc}\n{traceback.format_exc()}"
            )
        return results

# ============================================================================
# COMPANY UPDATER
# ============================================================================

class CompanyUpdater(BaseUpdater):
    def update_overview(self, symbol: str) -> int:
        if not self.vnstock:
            return 0
        self.limiter.check()
        try:
            stock = self.vnstock.stock(symbol=symbol, source='VCI')
            df = stock.company.overview()
            if df is None or df.empty:
                return 0
            row = df.iloc[0]
            self.conn.execute("DELETE FROM company_overview WHERE symbol=?", (symbol,))
            self.conn.execute(
                '''INSERT INTO company_overview
                   (symbol, history, company_profile, icb_name3, charter_capital, updated_at)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)''',
                (
                    symbol,
                    row.get('history'),
                    row.get('company_profile'),
                    row.get('icb_name3'),
                    row.get('charter_capital'),
                ),
            )
            self.conn.commit()
            return 1
        except Exception as exc:
            logger.error(f"Error updating company info for {symbol}: {exc}")
            return 0
