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
        # Pass the same python executable to ensure environment consistency
        result = subprocess.run([sys.executable] + cmd, check=True, capture_output=True, text=True)
        logger.info(f"✅ Finished: {description}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Failed: {description}")
        logger.error(f"Error: {e.stderr}")
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
    logger.info("🚀 STOCK DATA MAINTENANCE PIPELINE")
    logger.info("="*60)

    # 1. Fetch Fresh Data (Update the list file or pass symbols)
    # We use a default list or symbols.txt
    symbols_file = ensure_symbols_file(os.path.join(BASE_DIR, 'symbols.txt'))
    if symbols_file:
        # fetch_stock_data.py lives in project root (not scripts/)
        fetch_cmd = [os.path.join(BASE_DIR, 'fetch_stock_data.py'), '--file', symbols_file, '--db', DB_PATH]
        if not run_command(fetch_cmd, "Fetching Financial Data (V3)"):
            logger.error("Stopping pipeline because fetch step failed.")
            return 1
    else:
        logger.error("Symbols file not found and could not be generated.")
        return 1

    # 2. Sync Overview from normalized ratio tables
    sync_cmd = [os.path.join(SCRIPTS_DIR, 'sync_overview.py')]
    if not run_command(sync_cmd, "Syncing Overview"):
        logger.error("Stopping pipeline because sync step failed.")
        return 1

    # 3. Update Peer Data
    # Note: local path might differ, adjust if needed
    peer_script = os.path.join(AUTOMATION_DIR, 'update_peers.py')
    if os.path.exists(peer_script):
        if not run_command([peer_script], "Updating Sector Peers"):
            logger.warning("Peer update failed, but pipeline will continue.")

    # 4. Clean up
    logger.info("🧹 Cleaning up root directory...")
    if not os.path.exists(BACKUPS_DIR):
        os.makedirs(BACKUPS_DIR)
    
    # Move loose db backups
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
