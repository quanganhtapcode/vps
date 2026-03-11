import websocket
import threading
import time
import json

def on_message(ws, message):
    if len(message) > 50:
        print(f"\n[RECEIVE] {message[:250]}... (length: {len(message)})")

def on_error(ws, error):
    print(f"\n[ERROR] {error}")

def on_close(ws, close_status_code, close_msg):
    print("\n[CLOSED] Connection closed")

def on_open(ws):
    print("\n[OPEN] Connected to BSC websocket.")
    ws.send("2")
    payload_hose = '421["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:HOSE"]}}]'
    payload_hnx = '422["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:HNX"]}}]'
    payload_upcom = '423["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:UPCOM"]}}]'
    
    ws.send(payload_hose)
    ws.send(payload_hnx)
    ws.send(payload_upcom)

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
    
    print("Listening for 5 seconds...")
    time.sleep(5)
    ws.close()
