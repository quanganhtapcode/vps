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
from datetime import datetime

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.join(BASE_DIR, 'scripts')
AUTOMATION_DIR = os.path.join(BASE_DIR, 'automation')
DB_PATH = os.path.join(BASE_DIR, 'stocks.db')
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

def main():
    logger.info("="*60)
    logger.info("🚀 STOCK DATA MAINTENANCE PIPELINE")
    logger.info("="*60)

    # 1. Fetch Fresh Data (Update the list file or pass symbols)
    # We use a default list or symbols.txt
    symbols_file = os.path.join(BASE_DIR, 'symbols.txt')
    if os.path.exists(symbols_file):
        fetch_cmd = [os.path.join(SCRIPTS_DIR, 'fetch_stock_data.py'), '--file', symbols_file, '--db', DB_PATH]
        run_command(fetch_cmd, "Fetching Financial Data (V3)")
    else:
        logger.warning("Symbols file not found. Skipping fetch or use --symbol.")

    # 2. Sync Global Overview (Crucial for fixing ROE/ROA=0 issues)
    sync_cmd = [os.path.join(SCRIPTS_DIR, 'global_sync_overview.py')]
    run_command(sync_cmd, "Syncing Global Overview")

    # 3. Update Peer Data
    # Note: local path might differ, adjust if needed
    peer_script = os.path.join(AUTOMATION_DIR, 'update_peers.py')
    if os.path.exists(peer_script):
        run_command([peer_script], "Updating Sector Peers")

    # 4. Clean up
    logger.info("🧹 Cleaning up root directory...")
    if not os.path.exists(BACKUPS_DIR):
        os.makedirs(BACKUPS_DIR)
    
    # Move loose db backups
    import glob
    for f in glob.glob(os.path.join(BASE_DIR, "stocks.db.backup_*")):
        shutil_move = f"mv {f} {BACKUPS_DIR}/"
        subprocess.run(shutil_move, shell=True)
    
    logger.info("="*60)
    logger.info("✨ PIPELINE COMPLETED")
    logger.info("="*60)

if __name__ == "__main__":
    main()
