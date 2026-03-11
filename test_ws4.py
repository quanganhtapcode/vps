import websocket
import threading
import time
import json

def on_message(ws, message):
    if len(message) > 500:
        print(f"\n[RECEIVE] {message[:500]}... (length: {len(message)})")
    else:
        print(f"\n[RECEIVE] {message}")

def on_error(ws, error):
    print(f"\n[ERROR] {error}")

def on_close(ws, close_status_code, close_msg):
    print("\n[CLOSED] Connection closed")

def on_open(ws):
    print("\n[OPEN] Connected to BSC websocket.")
    
    # Engine.IO v3 ping
    ws.send("2")
    
    # The payload provided by user
    # 423["get", {"url": "/client/subscribe", "method": "get", "headers": {}, "data": {"op": "subscribe", "args": ["e:HOSE"]}}]
    # The leading number "423" is Engine.IO "4" (message), Socket.IO "2" (Event), and "3" is a message ID for ACKs.
    # Often just "42" is enough if we don't care about the ACK, but we can send exactly what they sent.
    
    payload = '423["get", {"url": "/client/subscribe", "method": "get", "headers": {}, "data": {"op": "subscribe", "args": ["e:HOSE"]}}]'
    print(f"[SEND] {payload}")
    ws.send(payload)
    
    payload_vn30 = '424["get", {"url": "/client/subscribe", "method": "get", "headers": {}, "data": {"op": "subscribe", "args": ["i:VN30"]}}]'
    print(f"[SEND] {payload_vn30}")
    ws.send(payload_vn30)

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
