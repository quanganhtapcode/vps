import sqlite3
import threading
import time
import logging
from typing import Dict, Any, Optional
from backend.db_path import resolve_vci_screening_db_path
from backend.data_sources.financial_repository import FinancialRepository

logger = logging.getLogger(__name__)

class ValuationService:
    def __init__(self, repo: FinancialRepository):
        self.repo = repo
        self.db_path = repo.db_path

    def calculate(self, symbol: str, request_data: dict) -> Dict[str, Any]:
        return calculate_valuation(self.db_path, symbol, request_data)



def _to_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    values = sorted(float(v) for v in values)
    n = len(values)
    mid = n // 2
    if n % 2 == 1:
        return values[mid]
    return (values[mid - 1] + values[mid]) / 2.0


def _summarize(values: list[float], computed_median: float | None) -> dict:
    if not values:
        return {
            'count': 0,
            'min': None,
            'max': None,
            'median_computed': computed_median,
        }
    return {
        'count': len(values),
        'min': float(min(values)),
        'max': float(max(values)),
        'median_computed': computed_median,
    }


class _IndustryCacheEntry:
    __slots__ = ('created_at', 'rows')

    def __init__(self, created_at: float, rows: list[tuple[str, float, float]]):
        self.created_at = created_at
        self.rows = rows


class IndustryComparablesCache:
    def __init__(self, ttl_seconds: int = 3600):
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._cache: dict[str, _IndustryCacheEntry] = {}

    def get_rows(self, db_path: str, industry: str) -> list[tuple[str, float, float]]:
        now = time.time()
        entry = self._cache.get(industry)
        if entry and (now - entry.created_at) < self._ttl_seconds:
            return entry.rows

        with self._lock:
            entry = self._cache.get(industry)
            if entry and (now - entry.created_at) < self._ttl_seconds:
                return entry.rows

            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                "SELECT symbol, pe, pb FROM overview WHERE industry = ?",
                (industry,),
            )
            rows: list[tuple[str, float, float]] = []
            for r in cur.fetchall() or []:
                rows.append(
                    (
                        str(r['symbol']).upper(),
                        _to_float(r['pe']),
                        _to_float(r['pb']),
                    )
                )
            conn.close()

            self._cache[industry] = _IndustryCacheEntry(now, rows)
            return rows


_industry_cache = IndustryComparablesCache(ttl_seconds=3600)


class ScreeningIndustryComparablesCache:
    def __init__(self, ttl_seconds: int = 3600):
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._cache: dict[str, _IndustryCacheEntry] = {}

    def get_rows(self, screening_db_path: str, icb_code_lv2: str) -> list[tuple[str, float, float]]:
        icb_code_lv2 = str(icb_code_lv2)
        now = time.time()
        entry = self._cache.get(icb_code_lv2)
        if entry and (now - entry.created_at) < self._ttl_seconds:
            return entry.rows

        with self._lock:
            entry = self._cache.get(icb_code_lv2)
            if entry and (now - entry.created_at) < self._ttl_seconds:
                return entry.rows

            conn = sqlite3.connect(screening_db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            # Keep ONLY tickers that have BOTH ttmPe and ttmPb (NULL rows excluded)
            cur.execute(
                """
                SELECT ticker, ttmPe, ttmPb
                FROM screening_data
                WHERE icbCodeLv2 = ?
                  AND ttmPe IS NOT NULL
                  AND ttmPb IS NOT NULL
                """,
                (icb_code_lv2,),
            )
            rows: list[tuple[str, float, float]] = []
            for r in cur.fetchall() or []:
                rows.append(
                    (
                        str(r['ticker']).upper(),
                        _to_float(r['ttmPe']),
                        _to_float(r['ttmPb']),
                    )
                )
            conn.close()

            self._cache[icb_code_lv2] = _IndustryCacheEntry(now, rows)
            return rows


_screening_industry_cache = ScreeningIndustryComparablesCache(ttl_seconds=3600)


def _dcf_per_share(
    base_cashflow_per_share: float,
    annual_growth: float,
    discount_rate: float,
    terminal_growth_rate: float,
    years: int,
) -> tuple[float, dict]:
    details = {
        'base_cashflow_per_share': float(base_cashflow_per_share),
        'annual_growth': float(annual_growth),
        'discount_rate': float(discount_rate),
        'terminal_growth': float(terminal_growth_rate),
        'years': int(years),
        'pv_sum': 0.0,
        'terminal_value': 0.0,
        'terminal_value_discounted': 0.0,
        'result': 0.0,
        'notes': [],
    }

    if base_cashflow_per_share <= 0:
        details['notes'].append('base_cashflow_per_share<=0 (cannot run DCF)')
        return 0.0, details
    if discount_rate <= 0:
        details['notes'].append('discount_rate<=0 (invalid)')
        return 0.0, details

    tg = terminal_growth_rate
    if tg >= discount_rate:
        tg = max(0.0, discount_rate - 0.01)
        details['notes'].append('terminal_growth adjusted to keep (r > g)')
    if tg < 0:
        tg = 0.0
        details['notes'].append('terminal_growth clamped to 0')

    pv_sum = 0.0
    cashflows = []
    for t in range(1, years + 1):
        cf_t = float(base_cashflow_per_share * ((1.0 + annual_growth) ** t))
        pv_t = float(cf_t / ((1.0 + discount_rate) ** t))
        pv_sum += pv_t
        cashflows.append({'t': t, 'cashflow': cf_t, 'pv': pv_t})

    cf_n = float(base_cashflow_per_share * ((1.0 + annual_growth) ** years))
    tv = float((cf_n * (1.0 + tg)) / (discount_rate - tg))
    tv_disc = float(tv / ((1.0 + discount_rate) ** years))
    result = float(pv_sum + tv_disc)

    details['pv_sum'] = float(pv_sum)
    details['terminal_value'] = float(tv)
    details['terminal_value_discounted'] = float(tv_disc)
    details['cashflows'] = cashflows
    details['terminal_growth_used'] = float(tg)
    details['result'] = float(result)
    return result, details


def load_inputs_from_sqlite(db_path: str, symbol: str, current_price_override: float | None = None) -> dict:
    symbol = symbol.upper()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    ov = cur.execute(
        "SELECT symbol, industry, current_price, eps_ttm, bvps, pe, pb FROM overview WHERE symbol = ?",
        (symbol,),
    ).fetchone()

    snap = None
    try:
        snap = cur.execute(
            """
            SELECT eps_ttm, eps, bvps, pe, pb
            FROM ratio_snap
            WHERE symbol = ?
            ORDER BY year_report DESC, length_report DESC
            LIMIT 1
            """,
            (symbol,),
        ).fetchone()
    except Exception:
        snap = None

    conn.close()

    if not ov:
        return {'success': False, 'error': f'Symbol {symbol} not found in overview'}

    industry = (ov['industry'] or 'Unknown')

    screening_db_path = resolve_vci_screening_db_path()
    screening_row = None
    try:
        screening_conn = sqlite3.connect(screening_db_path)
        screening_conn.row_factory = sqlite3.Row
        screening_cur = screening_conn.cursor()
        screening_row = screening_cur.execute(
            """
            SELECT ticker, icbCodeLv2, viSector, enSector, ttmPe, ttmPb
            FROM screening_data
            WHERE UPPER(ticker) = ?
            LIMIT 1
            """,
            (symbol,),
        ).fetchone()
        screening_conn.close()
    except Exception:
        screening_row = None

    current_price = _to_float(current_price_override) if current_price_override and current_price_override > 0 else _to_float(ov['current_price'])
    current_price_source = 'request.currentPrice' if current_price_override and current_price_override > 0 else 'sqlite.overview.current_price'

    eps = 0.0
    bvps = 0.0
    eps_source = 'missing'
    bvps_source = 'missing'

    ov_eps_ttm = _to_float(ov['eps_ttm'])
    ov_bvps = _to_float(ov['bvps'])
    ov_pe = _to_float(ov['pe'])
    ov_pb = _to_float(ov['pb'])

    screening_pe = _to_float(screening_row['ttmPe']) if screening_row and 'ttmPe' in screening_row.keys() else 0.0
    screening_pb = _to_float(screening_row['ttmPb']) if screening_row and 'ttmPb' in screening_row.keys() else 0.0

    snap_eps_ttm = _to_float(snap['eps_ttm']) if snap and 'eps_ttm' in snap.keys() else 0.0
    snap_eps = _to_float(snap['eps']) if snap and 'eps' in snap.keys() else 0.0
    snap_bvps = _to_float(snap['bvps']) if snap and 'bvps' in snap.keys() else 0.0
    snap_pe = _to_float(snap['pe']) if snap and 'pe' in snap.keys() else 0.0
    snap_pb = _to_float(snap['pb']) if snap and 'pb' in snap.keys() else 0.0

    if snap_eps_ttm > 0:
        eps = snap_eps_ttm
        eps_source = 'sqlite.ratio_snap.eps_ttm'
    elif ov_eps_ttm > 0:
        eps = ov_eps_ttm
        eps_source = 'sqlite.overview.eps_ttm'
    elif snap_eps > 0:
        eps = snap_eps
        eps_source = 'sqlite.ratio_snap.eps'
    else:
        pe_for_derive = snap_pe if snap_pe > 0 else (ov_pe if ov_pe > 0 else screening_pe)
        if current_price > 0 and pe_for_derive > 0:
            eps = current_price / pe_for_derive
            eps_source = 'derived: current_price / pe'

    if snap_bvps > 0:
        bvps = snap_bvps
        bvps_source = 'sqlite.ratio_snap.bvps'
    elif ov_bvps > 0:
        bvps = ov_bvps
        bvps_source = 'sqlite.overview.bvps'
    else:
        pb_for_derive = snap_pb if snap_pb > 0 else (ov_pb if ov_pb > 0 else screening_pb)
        if current_price > 0 and pb_for_derive > 0:
            bvps = current_price / pb_for_derive
            bvps_source = 'derived: current_price / pb'

    screening_industry_key = None
    screening_industry_name = None
    if screening_row:
        try:
            screening_industry_key = str(screening_row['icbCodeLv2']) if screening_row['icbCodeLv2'] is not None else None
        except Exception:
            screening_industry_key = None
        screening_industry_name = screening_row['viSector'] or screening_row['enSector']

    return {
        'success': True,
        'symbol': symbol,
        'industry': industry,
        'industry_screening_key': screening_industry_key,
        'industry_screening_name': screening_industry_name,
        'current_price': float(current_price),
        'current_price_source': current_price_source,
        'eps_ttm': float(eps),
        'eps_source': eps_source,
        'bvps': float(bvps),
        'bvps_source': bvps_source,
    }


def calculate_valuation(db_path: str, symbol: str, request_data: dict) -> dict:
    include_lists = bool(request_data.get('includeComparableLists') or request_data.get('include_comparable_lists'))
    try:
        comparable_list_limit = int(request_data.get('comparableListLimit') or (500 if include_lists else 50))
    except Exception:
        comparable_list_limit = 500 if include_lists else 50
    comparable_list_limit = max(0, min(comparable_list_limit, 2000))

    current_price_override = _to_float(request_data.get('currentPrice'))
    inputs = load_inputs_from_sqlite(
        db_path=db_path,
        symbol=symbol,
        current_price_override=current_price_override if current_price_override > 0 else None,
    )
    if not inputs.get('success'):
        return inputs

    industry = inputs['industry']
    current_price = float(inputs['current_price'])
    eps = float(inputs['eps_ttm'])
    bvps = float(inputs['bvps'])

    # Assumptions
    projection_years = int(_to_float(request_data.get('projectionYears'), 5))
    projection_years = max(1, min(projection_years, 20))
    growth = _to_float(request_data.get('revenueGrowth'), 8.0) / 100.0
    terminal_growth = _to_float(request_data.get('terminalGrowth'), 3.0) / 100.0
    required_return = _to_float(request_data.get('requiredReturn'), 12.0) / 100.0
    wacc = _to_float(request_data.get('wacc'), 10.5) / 100.0

    # Industry comparables (cached)
    screening_db_path = resolve_vci_screening_db_path()
    screening_key = inputs.get('industry_screening_key')
    screening_name = inputs.get('industry_screening_name')

    rows: list[tuple[str, float, float]] = []
    comparables_source = 'sqlite.overview (industry cohort cached; symbol excluded)'
    comparables_group = {'type': 'overview.industry', 'key': industry}

    if screening_key:
        try:
            rows = _screening_industry_cache.get_rows(screening_db_path, str(screening_key))
            comparables_source = (
                'sqlite.vci_screening.screening_data '
                '(icbCodeLv2 cohort cached; requires BOTH ttmPe and ttmPb; symbol excluded)'
            )
            comparables_group = {
                'type': 'vci_screening.icbCodeLv2',
                'key': str(screening_key),
                'name': screening_name,
            }
        except Exception:
            rows = []

    if not rows and industry and industry != 'Unknown':
        rows = _industry_cache.get_rows(db_path, industry)

    # Only keep rows where BOTH ttmPe & ttmPb exist (screening enforces this; overview fallback doesn't).
    # Then apply the same sanity filters used previously.
    pe_values_all = [pe for sym, pe, pb in rows if sym != inputs['symbol'] and 0 < pe <= 80 and pb > 0]
    pb_values_all = [pb for sym, pe, pb in rows if sym != inputs['symbol'] and 0 < pb <= 20 and pe > 0]

    industry_median_pe = _median(pe_values_all)
    industry_median_pb = _median(pb_values_all)

    pe_used = float(industry_median_pe) if industry_median_pe is not None else 15.0
    pb_used = float(industry_median_pb) if industry_median_pb is not None else 1.5

    justified_pe = float(eps * pe_used) if eps > 0 else 0.0
    justified_pb = float(bvps * pb_used) if bvps > 0 else 0.0

    graham = 0.0
    if eps > 0 and bvps > 0:
        graham = float((22.5 * eps * bvps) ** 0.5)

    fcfe_value, fcfe_details = _dcf_per_share(
        base_cashflow_per_share=float(eps),
        annual_growth=float(growth),
        discount_rate=float(required_return),
        terminal_growth_rate=float(terminal_growth),
        years=int(projection_years),
    )
    fcff_value, fcff_details = _dcf_per_share(
        base_cashflow_per_share=float(eps),
        annual_growth=float(growth),
        discount_rate=float(wacc),
        terminal_growth_rate=float(terminal_growth),
        years=int(projection_years),
    )

    valuations = {
        'fcfe': float(fcfe_value),
        'fcff': float(fcff_value),
        'justified_pe': float(justified_pe),
        'justified_pb': float(justified_pb),
        'graham': float(graham),
    }

    # Weighted average
    weights = request_data.get('modelWeights', {}) or {}
    if not any(_to_float(w) > 0 for w in weights.values()):
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
        val = _to_float(valuations.get(key))
        w = _to_float(weight)
        if val > 0 and w > 0:
            total_val += val * w
            total_weight += w
    weighted_avg = (total_val / total_weight) if total_weight > 0 else 0.0
    valuations['weighted_average'] = float(weighted_avg)

    pe_values_export = pe_values_all[:comparable_list_limit]
    pb_values_export = pb_values_all[:comparable_list_limit]
    pe_truncated = len(pe_values_all) > len(pe_values_export)
    pb_truncated = len(pb_values_all) > len(pb_values_export)

    export = {
        'market': {
            'current_price': float(current_price),
            'current_price_source': inputs['current_price_source'],
        },
        'comparables': {
            'industry': industry,
            'group': comparables_group,
            'pe_ttm': {
                **_summarize(pe_values_all, industry_median_pe),
                'used': float(pe_used),
                'values': [float(v) for v in pe_values_export] if include_lists else [],
                'truncated': bool(pe_truncated) if include_lists else False,
                'filter': {'min_exclusive': 0, 'max_inclusive': 80},
            },
            'pb': {
                **_summarize(pb_values_all, industry_median_pb),
                'used': float(pb_used),
                'values': [float(v) for v in pb_values_export] if include_lists else [],
                'truncated': bool(pb_truncated) if include_lists else False,
                'filter': {'min_exclusive': 0, 'max_inclusive': 20},
            },
            'defaults_if_missing': {'pe_ttm': 15.0, 'pb': 1.5},
            'source': comparables_source,
            'null_handling': 'Excluded rows with NULL ttmPe/ttmPb when source=vci_screening.screening_data',
        },
        'calculation': {
            'dcf_fcfe': {
                'cashflow_proxy': 'eps_ttm (per-share proxy)',
                'eps_ttm': float(eps),
                'eps_source': inputs['eps_source'],
                'inputs': {
                    'projection_years': int(projection_years),
                    'growth': float(growth),
                    'terminal_growth': float(terminal_growth),
                    'required_return': float(required_return),
                },
                'details': fcfe_details,
                'result': float(fcfe_value),
            },
            'dcf_fcff': {
                'cashflow_proxy': 'eps_ttm (per-share proxy)',
                'eps_ttm': float(eps),
                'eps_source': inputs['eps_source'],
                'inputs': {
                    'projection_years': int(projection_years),
                    'growth': float(growth),
                    'terminal_growth': float(terminal_growth),
                    'wacc': float(wacc),
                },
                'details': fcff_details,
                'result': float(fcff_value),
            },
            'justified_pe': {
                'eps_ttm': float(eps),
                'eps_source': inputs['eps_source'],
                'pe_used': float(pe_used),
                'formula': 'eps_ttm * pe_used',
                'result': float(justified_pe),
            },
            'justified_pb': {
                'bvps': float(bvps),
                'bvps_source': inputs['bvps_source'],
                'pb_used': float(pb_used),
                'formula': 'bvps * pb_used',
                'result': float(justified_pb),
            },
        },
        'list_limit': comparable_list_limit,
        'include_lists': bool(include_lists),
        'inputs_sources': {
            'eps_ttm': inputs['eps_source'],
            'bvps': inputs['bvps_source'],
            'current_price': inputs['current_price_source'],
        },
    }

    return {
        'success': True,
        'symbol': inputs['symbol'],
        'valuations': valuations,
        'inputs': {
            'current_price': float(current_price),
            'eps_ttm': float(eps),
            'bvps': float(bvps),
            'industry': industry,
            'industry_median_pe_ttm_used': float(pe_used),
            'industry_median_pb_used': float(pb_used),
            'industry_pe_sample_size': int(len(pe_values_all)),
            'industry_pb_sample_size': int(len(pb_values_all)),
        },
        'export': export,
    }
