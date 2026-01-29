
import requests
import os

missing = ["DKG","BHH","DDB","QNP","TNV","DKW","EGL","AIG","SBB","UTT","MZG","CCS","STD","HPO","HLO","MBT","UXC","CRV"]
base_url = "https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/{}.jpeg"
target_dir = r"c:\Users\PC\Downloads\Hello\frontend-next\public\logos"

for symbol in missing:
    url = base_url.format(symbol)
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            with open(os.path.join(target_dir, f"{symbol}.jpg"), "wb") as f:
                f.write(r.content)
            print(f"Retried {symbol}: Success")
        else:
            # Try .png or .jpg just in case
            for ext in [".png", ".jpg", ".JPG", ".jpeg"]:
                alt_url = f"https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/{symbol}{ext}"
                r_alt = requests.get(alt_url, timeout=5)
                if r_alt.status_code == 200:
                    with open(os.path.join(target_dir, f"{symbol}.jpg"), "wb") as f:
                        f.write(r_alt.content)
                    print(f"Retried {symbol} with {ext}: Success")
                    break
            else:
                print(f"Retried {symbol}: Failed ({r.status_code})")
    except Exception as e:
        print(f"Error retrying {symbol}: {e}")
