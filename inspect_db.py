import sqlite3
import pandas as pd
import json

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)

db_path = 'stocks_optimized.db'
conn = sqlite3.connect(db_path)

# List all tables
tables = pd.read_sql_query("SELECT name FROM sqlite_master WHERE type='table';", conn)
with open('inspect_db_output.txt', 'w', encoding='utf-8') as f:
    f.write('--- TABLES IN DATABASE ---\n')
    f.write(tables.to_string() + '\n\n')

    # For each table, let's see the schema and some sample rows for HPG, FPT, VCB
    symbols_to_check = ['HPG', 'FPT', 'VCB']

    for table_name in tables['name']:
        f.write(f'=== TABLE: {table_name} ===\n')
        # Count rows
        count = pd.read_sql_query(f'SELECT COUNT(*) as cnt FROM {table_name}', conn).iloc[0]['cnt']
        f.write(f'Total Rows: {count}\n')
        
        # Check if there is a "symbol" or "ticker" column
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = [col[1] for col in cursor.fetchall()]
        
        sym_col = 'symbol' if 'symbol' in columns else ('ticker' if 'ticker' in columns else None)
        
        if sym_col:
            # Get rows for our test symbols
            query = f"SELECT * FROM {table_name} WHERE {sym_col} IN ('HPG', 'FPT', 'VCB')"
            sample = pd.read_sql_query(query, conn)
            f.write(f'Sample data for HPG, FPT, VCB:\n')
            if not sample.empty:
                f.write(sample.to_string() + '\n')
                
                # Check for nulls/blanks in these specific rows
                f.write('\nChecking for NULLs, Blanks, or suspicious JSON structures...\n')
                problematic = []
                for col in sample.columns:
                    null_count = sample[col].isnull().sum()
                    blank_count = (sample[col] == '').sum()
                    if null_count > 0 or blank_count > 0:
                        problematic.append(f"{col} (Nulls: {null_count}, Blanks: {blank_count})")
                    
                    if sample[col].dtype == object:
                        try:
                            val = sample[col].dropna().iloc[0]
                            if isinstance(val, str) and (val.startswith('[') or val.startswith('{')):
                                parsed = json.loads(val)
                                if isinstance(parsed, list) and all((x == 0 or x is None or x == '') for x in parsed):
                                   problematic.append(f"{col} (JSON array filled with zeroes/nulls)")
                                elif isinstance(parsed, dict) and not parsed:
                                   problematic.append(f"{col} (Empty JSON dict)")
                        except Exception:
                            pass

                if problematic:
                    f.write('Found the following issues in the sample:\n')
                    for p in problematic:
                        f.write(' - ' + p + '\n')
                else:
                    f.write('No obvious NULL, BLANK, or empty JSON values found for these test stocks.\n')
            else:
                f.write('No data found for these test stocks in this table.\n')
        else:
            f.write('No symbol/ticker column to filter by. Showing first 2 rows:\n')
            f.write(pd.read_sql_query(f"SELECT * FROM {table_name} LIMIT 2", conn).to_string() + '\n')
        f.write('\n' + '='*80 + '\n\n')

conn.close()
