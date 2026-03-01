#!/bin/bash
# Recover corrupted vietnam_stocks.db into a clean file
# Run: nohup bash /tmp/recover_db.sh > /tmp/recover.log 2>&1 &
echo "$(date) Starting recovery..." > /tmp/recover_done.txt
sqlite3 /var/www/valuation/vietnam_stocks.db '.recover' | sqlite3 /var/www/valuation/vietnam_stocks_clean.db
RC=$?
if [ $RC -eq 0 ]; then
    SIZE=$(du -sh /var/www/valuation/vietnam_stocks_clean.db | cut -f1)
    echo "$(date) DONE - clean DB size: $SIZE" > /tmp/recover_done.txt
else
    echo "$(date) FAIL - exit code $RC" > /tmp/recover_done.txt
fi
