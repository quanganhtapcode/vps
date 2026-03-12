import websocket
import threading
import time
import json
import logging
import queue
import requests

from backend.data_sources.vci import VCIClient

logger = logging.getLogger(__name__)

class BSCWebSocket:
    _thread_started = False
    _ws = None
    _lock = threading.Lock()
    _last_update_ts = 0
    _snapshot_loaded = False
    _clients = set()

    # Refresh snapshot every 10 minutes (catch ref/ceil/floor changes between sessions)
    _SNAPSHOT_REFRESH_INTERVAL = 600

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
    def _load_snapshot(cls):
        """Load full snapshot from BSC instruments REST API.
        Provides: ref, ceiling, floor, current price, bid/ask 3 levels, volume.
        Called once on startup, then periodically refreshed.
        """
        snapshot = {}
        try:
            for ex in ('HOSE', 'HNX', 'UPCOM'):
                url = f"https://priceapi.bsc.com.vn/datafeed/instruments?exchange={ex}"
                r = requests.get(url, timeout=15)
                if r.status_code != 200:
                    logger.warning(f"[BSC WS] Snapshot {ex} HTTP {r.status_code}")
                    continue
                for item in r.json().get('d', []):
                    sym = item.get('symbol')
                    if not sym:
                        continue
                    close = float(item.get('closePrice') or item.get('priceTwo') or 0)
                    ref   = float(item.get('reference') or 0)
                    snapshot[sym] = {
                        's':    sym,
                        'c':    close,
                        'ref':  ref,
                        'ceil': float(item.get('ceiling') or 0),
                        'flo':  float(item.get('floor') or 0),
                        'ch':   float(item.get('change') or 0),
                        'chp':  float(item.get('changePercent') or 0),
                        'vo':   float(item.get('totalTrading') or 0),
                        'avg':  float(item.get('averagePrice') or 0),
                        'open': float(item.get('open') or 0),
                        'high': float(item.get('high') or 0),
                        'low':  float(item.get('low') or 0),
                        # Bid ladder (buy side) — price descending
                        'b1p':  float(item.get('bidPrice1') or 0),
                        'b1v':  float(item.get('bidVol1') or 0),
                        'b2p':  float(item.get('bidPrice2') or 0),
                        'b2v':  float(item.get('bidVol2') or 0),
                        'b3p':  float(item.get('bidPrice3') or 0),
                        'b3v':  float(item.get('bidVol3') or 0),
                        # Ask ladder (sell side) — price ascending
                        'a1p':  float(item.get('offerPrice1') or 0),
                        'a1v':  float(item.get('offerVol1') or 0),
                        'a2p':  float(item.get('offerPrice2') or 0),
                        'a2v':  float(item.get('offerVol2') or 0),
                        'a3p':  float(item.get('offerPrice3') or 0),
                        'a3v':  float(item.get('offerVol3') or 0),
                        'fb':   float(item.get('foreignBuy') or 0),
                        'fs':   float(item.get('foreignSell') or 0),
                        'source': 'BSC_SNAP',
                    }
            if snapshot:
                with cls._lock:
                    VCIClient._price_cache.update(snapshot)
                    cls._last_update_ts = time.time()
                    cls._snapshot_loaded = True
                logger.info(f"[BSC WS] Snapshot loaded: {len(snapshot)} symbols")
        except Exception as e:
            logger.error(f"[BSC WS] Snapshot failed: {e}")

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
        """Apply WebSocket delta patches onto the snapshot cache.

        BSC sends two types of delta packets:
          Trade packet  — has P2 (match price), P1 (match vol), TT/TV (cumulative)
          Depth packet  — has B1/S1... (bid/ask ladder update), no price
        Both types carry 'SB' as the symbol name directly.
        """
        if not items:
            return
        updates = {}
        with cls._lock:
            cache = VCIClient._price_cache

        for item in items:
            sym = item.get('SB')
            if not sym:
                continue

            # Start from existing snapshot entry (preserves ref/ceil/flo etc.)
            entry = dict(cache.get(sym, {'s': sym, 'source': 'BSC_WS'}))
            changed = False

            # ── Trade update (P2 = match price) ──────────────────────────
            p2 = item.get('P2') or item.get('CP')
            if p2:
                price = float(p2)
                entry['c'] = price
                entry['source'] = 'BSC_WS'
                changed = True

                if item.get('AP'):
                    entry['avg'] = float(item['AP'])

                if item.get('CH') is not None:
                    ch = float(item['CH'])
                    entry['ch'] = ch
                    # Derive ref from price and VNĐ change if snapshot ref is missing
                    if ch != 0 and not entry.get('ref'):
                        entry['ref'] = price - ch

                if item.get('CHP') is not None:
                    entry['chp'] = float(item['CHP'])

                if item.get('TT'):
                    entry['vo'] = float(item['TT'])

                if item.get('TV'):
                    entry['tv'] = float(item['TV'])

                if item.get('P1'):
                    entry['last_vol'] = float(item['P1'])   # volume of this specific match

            # ── Depth update (bid/ask ladder) ─────────────────────────────
            # B1/B2/B3 = bid prices, V1/V2/V3 = bid volumes
            # S1/S2/S3 = ask prices, U1/U2/U3 = ask volumes
            for i, (bp, bv, ap, av) in enumerate(
                [('B1','V1','S1','U1'), ('B2','V2','S2','U2'), ('B3','V3','S3','U3')], start=1
            ):
                if item.get(bp) is not None:
                    entry[f'b{i}p'] = float(item[bp])
                    changed = True
                if item.get(bv) is not None:
                    entry[f'b{i}v'] = float(item[bv])
                    changed = True
                if item.get(ap) is not None:
                    entry[f'a{i}p'] = float(item[ap])
                    changed = True
                if item.get(av) is not None:
                    entry[f'a{i}v'] = float(item[av])
                    changed = True

            if changed:
                updates[sym] = entry

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
        # Load full snapshot first so the cache has ref/ceil/floor/bid/ask immediately
        cls._load_snapshot()
        last_snapshot_ts = time.time()

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

        def heartbeat(ws):
            while ws.sock and ws.sock.connected:
                try:
                    ws.send("2")
                    time.sleep(10)
                except Exception:
                    break

        while True:
            cls._ws = websocket.WebSocketApp(url,
                                             on_open=on_open,
                                             on_message=cls._on_message,
                                             on_error=on_error,
                                             on_close=on_close)

            def run_heartbeat(ws):
                t = threading.Thread(target=heartbeat, args=(ws,), daemon=True)
                t.start()

            cls._ws.on_open = lambda ws: (on_open(ws), run_heartbeat(ws))

            cls._ws.run_forever()
            logger.warning("[BSC WS] Reconnecting in 5s...")
            time.sleep(5)

            # Refresh snapshot periodically (picks up new ref/ceil/floor each session)
            if time.time() - last_snapshot_ts > cls._SNAPSHOT_REFRESH_INTERVAL:
                cls._load_snapshot()
                last_snapshot_ts = time.time()

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
