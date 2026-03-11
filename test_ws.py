import socketio
import time

sio = socketio.Client(logger=True, engineio_logger=True)

@sio.event
def connect():
    print("Connected to Vietcap Socket.IO")
    # Try to subscribe to a specific symbol like FPT, or general prices
    subscribe_payloads = [
        {'symbols': ['FPT', 'VCB', 'ACB']},
        {'indexes': ['VNINDEX']},
    ]
    for p in subscribe_payloads:
        sio.emit('subscribe', p)
        sio.emit('sub', p)

@sio.event
def message(data):
    print("message:", data)

@sio.event
def price(data):
    print("price:", data)

@sio.event
def update(data):
    print("update:", data)

@sio.on('*')
def catch_all(event, data):
    print(f"Event: {event}, Data: {data}")

try:
    print("Connecting...")
    sio.connect(
        "https://trading.vietcap.com.vn",
        transports=['websocket'],
        socketio_path="ws/price/socket.io",
        headers={
            'Origin': 'https://trading.vietcap.com.vn',
            'Referer': 'https://trading.vietcap.com.vn/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }
    )
    print("Waiting for messages (10 seconds)...")
    time.sleep(10)
    sio.disconnect()
    print("Done.")
except Exception as e:
    print(f"Error: {e}")
