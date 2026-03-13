import logging
import os
import sqlite3
from typing import Callable

import numpy as np

from backend.cache_utils import cache_get_ns, cache_set_ns
from backend.db_path import resolve_vci_screening_db_path

logger = logging.getLogger(__name__)

VCI_METRICS_SOURCE = "vci_screening.sqlite"
SOURCE_PRIORITY_LABEL = "vci_screening -> vietnam_stocks -> vnstock"

_LOCAL_CACHE_NAMESPACE = "source_priority"
_LOCAL_CACHE_TTL_SECONDS = 600


CacheGet = Callable[[str], object]
CacheSet = Callable[[str, object], None]


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


def _normalize_percent_value(value) -> float | None:
    try:
        if value is None:
            return None
        v = float(value)
        if np.isnan(v) or np.isinf(v):
            return None
        if abs(v) <= 1:
            return float(v * 100.0)
        return float(v)
    except Exception:
        return None


def _cache_get(cache_get: CacheGet | None, key: str):
    if cache_get:
        return cache_get(key)
    return cache_get_ns(_LOCAL_CACHE_NAMESPACE, key)


def _cache_set(cache_set: CacheSet | None, key: str, value):
    if cache_set:
        cache_set(key, value)
        return
    cache_set_ns(_LOCAL_CACHE_NAMESPACE, key, value, ttl=_LOCAL_CACHE_TTL_SECONDS)


def _load_screening_rows(symbols: list[str]) -> dict[str, dict]:
    db_path = resolve_vci_screening_db_path()
    if not db_path or not os.path.exists(db_path):
        return {}

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='screening_data'")
        if cur.fetchone() is None:
            return {}

        cols = {
            str(r[1])
            for r in cur.execute("PRAGMA table_info(screening_data)").fetchall() or []
            if len(r) > 1
        }
        wanted = [
            "ticker",
            "ttmPe",
            "ttmPb",
            "ttmRoe",
            "marketCap",
            "npatmiGrowthYoyQm1",
            "netMargin",
        ]
        selected = [c for c in wanted if c in cols]
        if "ticker" not in selected:
            return {}

        unique_symbols = sorted({str(s or "").upper().strip() for s in symbols if str(s or "").strip()})
        if not unique_symbols:
            return {}

        placeholders = ",".join(["?"] * len(unique_symbols))
        rows = cur.execute(
            f"SELECT {', '.join(selected)} FROM screening_data WHERE UPPER(ticker) IN ({placeholders})",
            unique_symbols,
        ).fetchall()

        out: dict[str, dict] = {}
        for row in rows:
            symbol = str(row["ticker"]).upper().strip()
            out[symbol] = {
                "pe": _to_json_number(row["ttmPe"]) if "ttmPe" in row.keys() else 0.0,
                "pb": _to_json_number(row["ttmPb"]) if "ttmPb" in row.keys() else 0.0,
                "roe": _normalize_percent_value(row["ttmRoe"]) if "ttmRoe" in row.keys() else None,
                "market_cap": _to_json_number(row["marketCap"]) if "marketCap" in row.keys() else 0.0,
                "profit_growth": _normalize_percent_value(row["npatmiGrowthYoyQm1"]) if "npatmiGrowthYoyQm1" in row.keys() else None,
                "net_margin": _normalize_percent_value(row["netMargin"]) if "netMargin" in row.keys() else None,
                "source": VCI_METRICS_SOURCE,
            }
        return out
    except Exception as exc:
        logger.debug(f"screening_data batch lookup failed: {exc}")
        return {}
    finally:
        if conn:
            conn.close()


def get_screening_metrics(
    symbol: str,
    cache_get: CacheGet | None = None,
    cache_set: CacheSet | None = None,
) -> dict | None:
    symbol_u = str(symbol or "").upper().strip()
    if not symbol_u:
        return None

    cache_key = f"screening_metrics_{symbol_u}"
    cached = _cache_get(cache_get, cache_key)
    if cached is not None:
        return cached

    rows = _load_screening_rows([symbol_u])
    result = rows.get(symbol_u)
    _cache_set(cache_set, cache_key, result)
    return result


def get_screening_metrics_map(
    symbols: list[str],
    cache_get: CacheGet | None = None,
    cache_set: CacheSet | None = None,
) -> dict[str, dict]:
    normalized = sorted({str(s or "").upper().strip() for s in symbols if str(s or "").strip()})
    if not normalized:
        return {}

    out: dict[str, dict] = {}
    misses: list[str] = []

    for symbol in normalized:
        cache_key = f"screening_metrics_{symbol}"
        cached = _cache_get(cache_get, cache_key)
        if cached is None:
            misses.append(symbol)
        elif isinstance(cached, dict):
            out[symbol] = cached

    if misses:
        loaded = _load_screening_rows(misses)
        for symbol in misses:
            cache_key = f"screening_metrics_{symbol}"
            value = loaded.get(symbol)
            _cache_set(cache_set, cache_key, value)
            if isinstance(value, dict):
                out[symbol] = value

    return out


def apply_source_priority(
    data: dict,
    symbol: str,
    cache_get: CacheGet | None = None,
    cache_set: CacheSet | None = None,
) -> dict:
    if not isinstance(data, dict):
        return data

    out = dict(data)
    screening = get_screening_metrics(symbol, cache_get=cache_get, cache_set=cache_set)
    if not screening:
        out.setdefault("source_priority", SOURCE_PRIORITY_LABEL)
        return out

    pe = _to_json_number(screening.get("pe"))
    pb = _to_json_number(screening.get("pb"))
    roe = screening.get("roe")
    market_cap = _to_json_number(screening.get("market_cap"))

    if pe > 0:
        out["pe"] = pe
        out["pe_ratio"] = pe
        out["pe_source"] = screening["source"]
    if pb > 0:
        out["pb"] = pb
        out["pb_ratio"] = pb
        out["pb_source"] = screening["source"]
    if roe is not None and roe != 0:
        out["roe"] = float(roe)
        out["roe_source"] = screening["source"]
    if market_cap > 0:
        out["market_cap"] = market_cap
        out["marketCap"] = market_cap
        out["market_cap_source"] = screening["source"]

    out["fresh_metrics_source"] = screening["source"]
    out["source_priority"] = SOURCE_PRIORITY_LABEL
    return out


def apply_peer_source_priority(peer: dict, screening: dict | None) -> dict:
    if not isinstance(peer, dict) or not screening:
        return peer

    out = dict(peer)
    if screening.get("pe") is not None:
        out["pe"] = screening.get("pe")
    if screening.get("pb") is not None:
        out["pb"] = screening.get("pb")
    if screening.get("roe") is not None:
        out["roe"] = screening.get("roe")
    if screening.get("net_margin") is not None:
        out["net_profit_margin"] = screening.get("net_margin")
    if screening.get("profit_growth") is not None:
        out["profit_growth"] = screening.get("profit_growth")
    if screening.get("market_cap") is not None:
        out["market_cap"] = screening.get("market_cap")

    out["fresh_metrics_source"] = screening.get("source", VCI_METRICS_SOURCE)
    out["source_priority"] = SOURCE_PRIORITY_LABEL
    return out
