#!/usr/bin/env python3
"""
Master Pipeline for Stock Data Maintenance
1. Fetch fresh data (V3 Schema)
2. Sync data to stock_overview (Fixes ROE/ROA=0)
3. Update sector peers
4. Cleanup old backups
"""

import os
import sys
import subprocess
import logging
import shutil
from datetime import datetime

from backend.db_path import resolve_stocks_db_path

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.join(BASE_DIR, 'scripts')
AUTOMATION_DIR = os.path.join(BASE_DIR, 'automation')
DB_PATH = resolve_stocks_db_path()
BACKUPS_DIR = os.path.join(BASE_DIR, 'backups')

LOGS_DIR = os.path.join(BASE_DIR, 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOGS_DIR, "pipeline.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def run_command(cmd, description):
    logger.info(f">>> Starting: {description}")
    try:
        # Stream child process output to our logger (stdout + pipeline.log) so
        # long-running steps are observable under systemd/journalctl.
        proc = subprocess.Popen(
            [sys.executable] + cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            logger.info(line.rstrip())

        rc = proc.wait()
        if rc == 0:
            logger.info(f"✅ Finished: {description}")
            return True

        logger.error(f"❌ Failed: {description} (exit code {rc})")
        return False
    except Exception as e:
        logger.error(f"❌ Failed: {description}")
        logger.error(f"Error: {e}")
        return False

def ensure_symbols_file(symbols_file: str):
    """Ensure symbols file exists; fallback to DB-derived symbols when missing."""
    if os.path.exists(symbols_file):
        return symbols_file

    logger.warning("symbols.txt not found. Building it from database company table...")
    try:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT symbol FROM company WHERE symbol IS NOT NULL ORDER BY symbol")
        symbols = [row[0].strip().upper() for row in cursor.fetchall() if row and row[0]]
        conn.close()

        if not symbols:
            logger.error("No symbols found in company table.")
            return None

        with open(symbols_file, 'w', encoding='utf-8') as f:
            for symbol in symbols:
                f.write(f"{symbol}\n")

        logger.info(f"Generated symbols file with {len(symbols)} symbols: {symbols_file}")
        return symbols_file
    except Exception as e:
        logger.error(f"Failed to generate symbols file from DB: {e}")
        return None

def main() -> int:
    logger.info("="*60)
    logger.info("🚀 STOCK DATA MAINTENANCE PIPELINE (V4 - INTEGRATED)")
    logger.info("="*60)

    # 1. Programmatic Update using db_updater (Optimized)
    # This uses the smart skip logic: if data is < 30 days old, it skips the stock.
    # Total runtime is ~18h for 1700 stocks if ALL need update, but ~5 mins if all are fresh.
    try:
        # Add db_updater to path
        sys.path.insert(0, os.path.join(BASE_DIR, 'db_updater'))
        from stock_database import StockDatabase
        
        # Use absolute path to DB from resolve_stocks_db_path()
        with StockDatabase(DB_PATH) as db:
            # Get all listed stocks
            stocks_df = db.get_listed_stocks()
            if stocks_df.empty:
                logger.error("No listed stocks found in database.")
                return 1
            
            symbols = stocks_df['ticker'].tolist()
            logger.info(f"Checking updates for {len(symbols)} listed stocks...")

            # Run smart update for BOTH quarterly and yearly data
            updater = db.financial_updater
            
            # QUARTERLY DATA (Higher priority, usually updates more often)
            logger.info("--- Phase 1: Quarterly Reports ---")
            updater.update_multiple_companies_smart(
                symbols=symbols,
                period='quarter',
                force_update=False,
                batch_size=10,            # Slightly more aggressive but still safe
                pause_between_batches=60  # Reduced pause since skip logic handles most stocks quickly
            )
            
            # YEARLY DATA
            logger.info("--- Phase 2: Yearly Reports ---")
            updater.update_multiple_companies_smart(
                symbols=symbols,
                period='year',
                force_update=False,
                batch_size=10,
                pause_between_batches=60
            )

    except Exception as e:
        logger.error(f"Failed to run integrated update: {e}")
        # Continue to other steps even if update fails

    # 2. Sync Overview
    sync_cmd = [os.path.join(SCRIPTS_DIR, 'sync_overview.py')]
    if not run_command(sync_cmd, "Syncing Overview"):
        logger.warning("Sync step skipped or failed (legacy tables might be missing).")

    # 3. Update Peer Data
    peer_script = os.path.join(AUTOMATION_DIR, 'update_peers.py')
    if os.path.exists(peer_script):
        if not run_command([peer_script], "Updating Sector Peers"):
            logger.warning("Peer update failed, but pipeline will continue.")

    # 4. Clean up
    logger.info("🧹 Cleaning up root directory...")
    if not os.path.exists(BACKUPS_DIR):
        os.makedirs(BACKUPS_DIR)
    
    import glob
    for f in glob.glob(os.path.join(BASE_DIR, "stocks.db.backup_*")):
        try:
            shutil.move(f, os.path.join(BACKUPS_DIR, os.path.basename(f)))
        except Exception as e:
            logger.warning(f"Failed to move backup {f}: {e}")
    
    logger.info("="*60)
    logger.info("✨ PIPELINE COMPLETED")
    logger.info("="*60)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
