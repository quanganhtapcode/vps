import json
import sqlite3
import pandas as pd
from backend.services.valuation_service import ValuationService
from backend.data_sources.financial_repository import FinancialRepository
from backend.db_path import resolve_stocks_db_path

def test_acb():
    db_path = resolve_stocks_db_path()
    repo = FinancialRepository(db_path)
    svc = ValuationService(repo)
    
    result = svc.calculate_valuation('ACB', {})
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    test_acb()
