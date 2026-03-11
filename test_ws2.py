import socketio
import time
import sys

sio = socketio.Client(logger=False, engineio_logger=False)

@sio.event
def connect():
    print("Connected!")
    p = [{"action": "join", "room": "FPT"}, {"symbol": "FPT"}, {"symbols": ["FPT"]}, "FPT"]
    for ev in ['subscribe', 'join', 'watch', 'room']:
        for payload in p:
            sio.emit(ev, payload)

@sio.on('*')
def catch_all(event, data):
    print(f"RCV -> Event: {event}, Data: {data}")

try:
    sio.connect(
        "https://trading.vietcap.com.vn",
        transports=['websocket'],
        socketio_path="ws/price/socket.io",
        headers={
            'Origin': 'https://trading.vietcap.com.vn',
            'Referer': 'https://trading.vietcap.com.vn/',
        }
    )
    time.sleep(10)
    sio.disconnect()
except Exception as e:
    print(e)
