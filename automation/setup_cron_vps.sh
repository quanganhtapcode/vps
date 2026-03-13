#!/bin/bash
# Installs crontab for VPS. Safe to re-run (strips old entries first).
# Piped through tr -d '\r' to strip Windows CRLF if script was edited on Windows.

CRON_INDEX="*/15 * * * * cd /var/www/valuation && .venv/bin/python fetch_sqlite/fetch_vci.py --indexes VNINDEX,HNXIndex,HNXUpcomIndex,VN30 --start-page 0 --end-page 0 --db fetch_sqlite/index_history.sqlite >> fetch_sqlite/cron.log 2>&1"
CRON_SCREENER="*/5 * * * * cd /var/www/valuation && .venv/bin/python fetch_sqlite/fetch_vci_screener.py --start-page 0 --page-size 50 --no-filter --db fetch_sqlite/vci_screening.sqlite --workers 10 >> fetch_sqlite/cron_screener.log 2>&1 && .venv/bin/python fetch_sqlite/fetch_vci_screener.py --start-page 0 --page-size 50 --db fetch_sqlite/vci_screening.sqlite --workers 10 >> fetch_sqlite/cron_screener.log 2>&1"
CRON_SCREENER_BACKUP="0 3 * * 0 cd /var/www/valuation && .venv/bin/python fetch_sqlite/backup_vci_screening.py --db fetch_sqlite/vci_screening.sqlite --backup-dir fetch_sqlite/backups/vci_screening --retention-days 30 >> fetch_sqlite/cron_backup_vci_screening.log 2>&1"
CRON_NEWS="*/5 * * * * cd /var/www/valuation && .venv/bin/python fetch_sqlite/fetch_vci_news.py --db fetch_sqlite/vci_ai_news.sqlite --pages 5 --page-size 50 --days-back 30 --prune-days 60 --workers 10 --insecure >> fetch_sqlite/cron_vci_ai_news.log 2>&1"
CRON_STANDOUTS="*/15 * * * * cd /var/www/valuation && .venv/bin/python fetch_sqlite/fetch_vci_standouts.py --db fetch_sqlite/vci_ai_standouts.sqlite --group hose --top-pos 5 --top-neg 5 --insecure >> fetch_sqlite/cron_vci_ai_standouts.log 2>&1"
CRON_TELEGRAM="*/30 * * * * /var/www/valuation/scripts/telegram_uptime_report.sh /var/www/valuation/.telegram_uptime.env >> /var/www/valuation/telegram_uptime.log 2>&1"

(crontab -l 2>/dev/null \
  | grep -v -E "fetch_vci\.py|fetch_vci_screener\.py|backup_vci_screening\.py|fetch_vci_news\.py|fetch_vci_standouts\.py|telegram_uptime_report\.sh" \
  | tr -d '\r'; \
  printf '%s\n' "$CRON_INDEX" "$CRON_SCREENER" "$CRON_SCREENER_BACKUP" "$CRON_NEWS" "$CRON_STANDOUTS" "$CRON_TELEGRAM" \
) | crontab -

echo "Cron jobs installed successfully."
crontab -l
