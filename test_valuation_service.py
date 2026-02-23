import sys
import os
import json

# Add parent directory to path so we can import backend
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), '..')))

# Mocking Flask context or extensions if needed
# But let's try direct instantiation

from backend.data_sources.financial_repository import FinancialRepository
from backend.services.valuation_service import ValuationService

def test_valuation():
    repo = FinancialRepository('vietnam_stocks.db')
    service = ValuationService(repo)
    
    symbol = 'VCB'
    request_data = {
        'revenueGrowth': 8,
        'terminalGrowth': 3,
        'wacc': 10.5,
        'requiredReturn': 12,
        'taxRate': 20,
        'projectionYears': 5,
        'modelWeights': {'fcfe': 20, 'fcff': 20, 'justified_pe': 20, 'justified_pb': 20, 'graham': 20}
    }
    
    results = service.calculate_valuation(symbol, request_data)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    test_valuation()
