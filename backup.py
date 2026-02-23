import os
import zipfile

def backup():
    # Only includes essential files to keep the backup lean, avoiding heavy auto-generated folders.
    exclusions = {'.git', 'node_modules', '.next', '__pycache__', '.venv', 'venv', 'dist', 'build'}
    zip_name = 'backup_v2_before_vietnam_stocks.zip'
    
    print(f"Bắt đầu nén toàn bộ project vào {zip_name} ...")
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Modifying dirs in-place to tell os.walk to skip ignored directories
            dirs[:] = [d for d in dirs if d not in exclusions]
            for file in files:
                # Bỏ qua các file rác hoặc các file zip khác
                if file.endswith('.zip'):
                    continue
                filepath = os.path.join(root, file)
                zipf.write(filepath, os.path.relpath(filepath, '.'))
                
    print("Backup hoàn tất!")

if __name__ == "__main__":
    backup()
