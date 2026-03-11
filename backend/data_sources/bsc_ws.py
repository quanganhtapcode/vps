import websocket
import threading
import time
import json
import logging
import requests
import queue

from backend.data_sources.vci import VCIClient

logger = logging.getLogger(__name__)

class BSCWebSocket:
    _thread_started = False
    _ws = None
    _id_to_symbol = {}
    _symbol_to_id = {}
    _lock = threading.Lock()
    _last_update_ts = 0
    _clients = set()

    @classmethod
    def register_client(cls):
        q = queue.Queue(maxsize=100)
        with cls._lock:
            cls._clients.add(q)
        return q

    @classmethod
    def unregister_client(cls, q):
        with cls._lock:
            if q in cls._clients:
                cls._clients.remove(q)

    @classmethod
    def _fetch_mapping(cls):
        try:
            exchanges = ['HOSE', 'HNX', 'UPCOM']
            temp_id_to_symbol = {}
            temp_symbol_to_id = {}
            for ex in exchanges:
                url = f"https://priceapi.bsc.com.vn/datafeed/instruments?exchange={ex}"
                r = requests.get(url, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    items = data.get('d', [])
                    for info in items:
                        symbol = info.get('symbol')
                        s_id = info.get('s')
                        if symbol and s_id is not None:
                            temp_symbol_to_id[symbol] = s_id
                            temp_id_to_symbol[str(s_id)] = symbol
            if temp_id_to_symbol:
                with cls._lock:
                    cls._id_to_symbol = temp_id_to_symbol
                    cls._symbol_to_id = temp_symbol_to_id
                logger.info(f"[BSC WS] Loaded {len(cls._id_to_symbol)} mappings.")
        except Exception as e:
            logger.error(f"[BSC WS] Failed to fetch mapping: {e}")

    @classmethod
    def _on_message(cls, ws, message):
        try:
            if message.startswith("42"):
                raw = json.loads(message[2:])
                if raw and isinstance(raw, list) and len(raw) >= 2:
                    event = raw[0]
                    payload = raw[1]
                    if event == "i" and isinstance(payload, dict):
                        data_arr = payload.get("d", [])
                        cls._process_data(data_arr)
        except Exception as e:
            pass # ignore malformed

    @classmethod
    def _process_data(cls, items):
        if not items:
            return
        updates = {}
        for item in items:
            s_id = str(item.get('s'))
            symbol = cls._id_to_symbol.get(s_id)
            if symbol and 'c' in item and 'r' in item:
                ref_price = float(item.get('r', 0) or item.get('reference', 0))
                current_price = float(item.get('MP', 0) or item.get('closePrice', 0) or item.get('price', 0))
                
                if current_price == 0:
                    current_price = ref_price

                updates[symbol] = {
                    's': symbol,
                    'c': current_price,
                    'ref': ref_price,
                    'cei': float(item.get('c', 0)),
                    'flo': float(item.get('f', 0)),
                    'vo': float(item.get('MV', 0) or item.get('closeVol', 0)),
                    'source': 'BSC_WS'
                }
        
        if updates:
            with cls._lock:
                VCIClient._price_cache.update(updates)
                cls._last_update_ts = time.time()
                for q in cls._clients:
                    try:
                        q.put_nowait(updates)
                    except queue.Full:
                        pass

    @classmethod
    def _ws_loop(cls):
        logger.info("[BSC WS] Starting WebSocket background thread...")
        cls._fetch_mapping()
        
        url = "wss://priceapi.bsc.com.vn/market/socket.io/?__sails_io_sdk_version=1.2.1&__sails_io_sdk_platform=browser&__sails_io_sdk_language=javascript&EIO=3&transport=websocket"
        
        def on_open(ws):
            logger.info("[BSC WS] Connected.")
            ws.send("2")
            ws.send('421["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:HOSE"]}}]')
            ws.send('422["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:HNX"]}}]')
            ws.send('423["get", {"url": "/client/subscribe", "method": "get", "data": {"op": "subscribe", "args": ["e:UPCOM"]}}]')
            
        def on_error(ws, error):
            logger.warning(f"[BSC WS] Error: {error}")
            
        def on_close(ws, status, msg):
            logger.info("[BSC WS] Closed.")

        while True:
            cls._ws = websocket.WebSocketApp(url,
                                             on_open=on_open,
                                             on_message=cls._on_message,
                                             on_error=on_error,
                                             on_close=on_close)
            cls._ws.run_forever(ping_interval=20, ping_timeout=10)
            logger.warning("[BSC WS] Reconnecting in 5s...")
            time.sleep(5)

    @classmethod
    def ensure_started(cls):
        if not cls._thread_started:
            with cls._lock:
                if not cls._thread_started:
                    t = threading.Thread(target=cls._ws_loop, daemon=True)
                    t.start()
                    cls._thread_started = True

    @classmethod
    def is_active(cls):
        return (time.time() - cls._last_update_ts) < 15
