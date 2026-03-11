import websocket
import threading
import time
import json

def on_message(ws, message):
    print(f"\n[RECEIVE] {message[:200]}...")

def on_error(ws, error):
    print(f"\n[ERROR] {error}")

def on_close(ws, close_status_code, close_msg):
    print("\n[CLOSED] Connection closed")

def on_open(ws):
    print("\n[OPEN] Connected to BSC websocket.")
    
    # Engine.IO v3 protocol expects "2" for ping, and we send socket.io protocol messages like:
    # 40 (Connect to default namespace)
    # Then maybe we need to subscribe or get
    
    # Send a ping just in case
    ws.send("2")
    
    # Try to send a Sails.js style GET request to subscribe to something common
    # For sails socket client, requests look like this:
    # 42["get", {"url": "/api/v1/ticket"}]
    # Let's send a generic socket.io join or subscribe just in case
    payloads = [
        '42["join", "HOSE"]',
        '42["subscribe", "VNINDEX"]',
        '42["sub", "FPT"]'
    ]
    for p in payloads:
        print(f"[SEND] {p}")
        ws.send(p)

if __name__ == "__main__":
    url = "wss://priceapi.bsc.com.vn/market/socket.io/?__sails_io_sdk_version=1.2.1&__sails_io_sdk_platform=browser&__sails_io_sdk_language=javascript&EIO=3&transport=websocket"
    
    ws = websocket.WebSocketApp(url,
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)

    wst = threading.Thread(target=ws.run_forever)
    wst.daemon = True
    wst.start()
    
    print("Listening for 10 seconds...")
    time.sleep(10)
    ws.close()
    print("Done testing.")
