#!/usr/bin/env python3
"""
Master Pipeline for Stock Data Maintenance

Steps (run daily via systemd stock-fetch.timer at 18:00 VN):
  1. Update financial reports (BCTC) for all symbols — daily, smart-skip
  2. Update stock list + company info               — weekly (Sunday only)
  3. Refresh compatibility views (overview, ratio_wide)

DB: Uses VIETNAM_STOCK_DB_PATH env var → falls back to db_updater/vietnam_stocks.db
"""

import os
import sys
import logging
from datetime import datetime
from pathlib import Path

# ── Resolve DB path BEFORE any db_updater import so that module-level
# DB_PATH = default_db_path() in each sub-script picks up the env var. ──────
BASE_DIR = Path(__file__).resolve().parent
DB_UPDATER_DIR = BASE_DIR / "db_updater"

# If VIETNAM_STOCK_DB_PATH is not in the environment (i.e. no .env loaded yet),
# default to the db_updater's own DB so both pipeline and backend share one file.
if not os.environ.get("VIETNAM_STOCK_DB_PATH"):
    os.environ["VIETNAM_STOCK_DB_PATH"] = str(DB_UPDATER_DIR / "vietnam_stocks.db")

DB_PATH = os.environ["VIETNAM_STOCK_DB_PATH"]

# ── Logging ─────────────────────────────────────────────────────────────────
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "pipeline.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _add_db_updater_to_path() -> None:
    """Ensure db_updater is importable from both sys paths."""
    for p in [str(BASE_DIR), str(DB_UPDATER_DIR)]:
        if p not in sys.path:
            sys.path.insert(0, p)


def _load_symbols() -> list[str]:
    """Load symbol list from symbols.txt, falling back to the DB stocks table."""
    symbols_file = BASE_DIR / "symbols.txt"
    if symbols_file.exists():
        symbols = [
            line.strip().upper()
            for line in symbols_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if symbols:
            logger.info(f"Loaded {len(symbols)} symbols from symbols.txt")
            return symbols

    # Fallback: query stocks table in DB
    logger.warning("symbols.txt not found — querying stocks table from DB")
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT ticker FROM stocks WHERE status = 'listed' ORDER BY ticker"
        ).fetchall()
        conn.close()
        symbols = [r[0] for r in rows if r[0]]
        if symbols:
            logger.info(f"Loaded {len(symbols)} symbols from DB stocks table")
            return symbols
    except Exception as e:
        logger.error(f"Failed to load symbols from DB: {e}")

    logger.error("No symbols found — aborting pipeline")
    return []


# ── Step 1: Financial Reports (BCTC) ─────────────────────────────────────────

def step_update_financial_reports(symbols: list[str]) -> bool:
    """Daily: fetch balance_sheet / income / cash_flow / ratios via db_updater."""
    _add_db_updater_to_path()
    try:
        from db_updater.scripts.cli.update_financial_reports import update_multiple_stocks  # type: ignore

        period = os.getenv("FETCH_PERIOD", "year").strip().lower() or "year"
        if period not in ("year", "quarter"):
            logger.warning(f"Invalid FETCH_PERIOD={period!r}, using 'year'")
            period = "year"

        try:
            delay = max(1, int(float(os.getenv("FETCH_DELAY_SECONDS", "30"))))
        except ValueError:
            delay = 30

        logger.info(
            f">>> Starting: Fetching BCTC via db_updater "
            f"(symbols={len(symbols)}, period={period}, delay={delay}s, db={DB_PATH})"
        )
        results = update_multiple_stocks(symbols=symbols, period=period, delay_between_stocks=delay)

        new_records = sum(
            sum(int(v or 0) for v in payload.values())
            for payload in (results or {}).values()
            if payload
        )
        success_count = sum(
            1 for payload in (results or {}).values()
            if payload and sum(int(v or 0) for v in payload.values()) > 0
        )
        logger.info(
            f"✅ Finished: BCTC update "
            f"(updated={success_count}/{len(symbols)} symbols, new_records={new_records})"
        )
        return True
    except Exception as e:
        logger.error(f"❌ Failed: BCTC update — {e}")
        return False


# ── Step 2: Stock list + Company Info (weekly) ────────────────────────────────

def step_update_company_info(symbols: list[str]) -> bool:
    """Weekly: refresh stocks list + company overview, shareholders, officers."""
    _add_db_updater_to_path()
    try:
        from stock_database import StockDatabase  # type: ignore

        logger.info(f">>> Starting: Stock list update (db={DB_PATH})")
        with StockDatabase(DB_PATH) as db:
            stock_count = db.update_stocks()
            logger.info(f"  stocks table: {stock_count} rows upserted")

        logger.info(f">>> Starting: Company info update ({len(symbols)} symbols)")
        with StockDatabase(DB_PATH) as db:
            results = db.company_updater.update_multiple_companies(symbols)
            total = sum(
                sum(v for v in r.values() if isinstance(v, int))
                for r in results.values()
            )
            logger.info(f"✅ Finished: Company info ({total} records across {len(results)} symbols)")
        return True
    except Exception as e:
        logger.error(f"❌ Failed: Company info update — {e}")
        return False


# ── Step 3: Compatibility Views ───────────────────────────────────────────────

def step_create_compat_views() -> bool:
    """Always: create/refresh overview + ratio_wide views for backend compatibility."""
    try:
        import importlib.util
        view_script = BASE_DIR / "scripts" / "create_compat_views.py"
        spec = importlib.util.spec_from_file_location("create_compat_views", view_script)
        mod = importlib.util.module_from_spec(spec)  # type: ignore
        spec.loader.exec_module(mod)  # type: ignore
        mod.create_views(DB_PATH)
        logger.info("✅ Finished: Compatibility views refreshed")
        return True
    except Exception as e:
        logger.error(f"❌ Failed: Compatibility views — {e}")
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    logger.info("=" * 60)
    logger.info("🚀 STOCK DATA MAINTENANCE PIPELINE")
    logger.info(f"   DB: {DB_PATH}")
    logger.info("=" * 60)

    symbols = _load_symbols()
    if not symbols:
        return 1

    # Step 1 — financial reports (daily)
    if not step_update_financial_reports(symbols):
        logger.error("Stopping pipeline: BCTC fetch failed")
        return 1

    # Step 2 — company info (weekly, Sunday only; skip on other days unless forced)
    today = datetime.now().weekday()  # 6 = Sunday
    force_company = os.getenv("FORCE_COMPANY_UPDATE", "").lower() in ("1", "true", "yes")
    if today == 6 or force_company:
        step_update_company_info(symbols)
    else:
        logger.info("Skipping company info update (runs on Sundays; set FORCE_COMPANY_UPDATE=1 to override)")

    # Step 3 — compat views (always)
    step_create_compat_views()

    logger.info("=" * 60)
    logger.info("✨ PIPELINE COMPLETED")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

