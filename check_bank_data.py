import sqlite3
import pandas as pd

def check_bank_data():
    conn = sqlite3.connect('vietnam_stocks.db')
    
    symbols = ['FPT', 'VCB', 'ACB']
    tables = ['income_statement', 'balance_sheet', 'cash_flow_statement']
    
    with open('bank_data_output.txt', 'w', encoding='utf-8') as f:
        for symbol in symbols:
            f.write(f"\n===== SYMBOL: {symbol} =====\n")
            for table in tables:
                query = f"SELECT * FROM {table} WHERE symbol = ? ORDER BY year DESC, quarter DESC LIMIT 1"
                df = pd.read_sql_query(query, conn, params=(symbol,))
                if df.empty:
                    f.write(f"Table {table}: NO DATA\n")
                else:
                    f.write(f"Table {table}: Found {len(df)} rows. Year: {df.iloc[0]['year']}, Quarter: {df.iloc[0]['quarter']}\n")
                    if table == 'income_statement':
                        cols = ['net_profit', 'net_profit_parent_company', 'eps']
                    elif table == 'balance_sheet':
                        cols = ['equity_total', 'total_assets', 'cash_and_equivalents']
                    elif table == 'cash_flow_statement':
                        cols = ['depreciation_fixed_assets', 'increase_decrease_receivables', 'increase_decrease_inventory', 'purchase_purchase_fixed_assets']
                    
                    valid_cols = [c for c in cols if c in df.columns]
                    f.write(df[valid_cols].to_string() + "\n")

    conn.close()

if __name__ == "__main__":
    check_bank_data()
