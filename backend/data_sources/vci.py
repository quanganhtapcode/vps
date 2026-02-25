"""
VCI (Vietcap) API Client
Direct API calls to Vietcap trading platform for realtime stock prices
NO vnstock quota used - completely free
"""

import requests
import logging
import time
import threading
from typing import Optional, Dict, Any, List

try:
    import socketio  # type: ignore
except Exception:  # pragma: no cover
    socketio = None

logger = logging.getLogger(__name__)

class VCIClient:
    """Client for Vietcap trading API"""
    
    BASE_URL = "https://trading.vietcap.com.vn/api/price/v1/w/priceboard"
    
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'application/json'
    }
    
    # Use a session for connection pooling
    _session = requests.Session()
    _session.headers.update(HEADERS)
    
    # Cache for bulk prices (stores the full data object for each symbol)
    _price_cache = {}
    _last_cache_update = 0
    _CACHE_TTL = 15 # Allow slightly longer TTL for background refresh
    
    # Cache for market indices - refreshed every 1s in background
    _indices_cache: List[Dict] = []
    _indices_last_update: float = 0
    _indices_source: str = 'EMPTY'
    _indices_history: Dict[str, List[float]] = {} # symbol -> [p1, p2, p3... p30]
    _HISTORY_SIZE = 30
    
    # Background refresh state
    _refresh_thread_started = False
    _indices_thread_started = False
    _indices_ws_thread_started = False
    _lock = threading.Lock()

    INDEX_REST_URL = "https://trading.vietcap.com.vn/api/price/marketIndex/getList"
    INDEX_SYMBOLS = ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]
    SOCKET_BASE_URL = "https://trading.vietcap.com.vn"
    SOCKET_PATH = "ws/price/socket.io"

    @classmethod
    def _normalize_index_item(cls, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not isinstance(item, dict):
            return None

        symbol = (
            item.get('symbol')
            or item.get('Symbol')
            or item.get('s')
            or item.get('index')
            or item.get('Index')
            or item.get('code')
            or item.get('Code')
        )
        if not symbol:
            return None

        symbol_u = str(symbol).upper()
        allowed = {s.upper() for s in cls.INDEX_SYMBOLS}
        if symbol_u not in allowed:
            return None

        price_raw = item.get('price')
        if price_raw is None:
            price_raw = item.get('Price')
        if price_raw is None:
            price_raw = item.get('c')
        if price_raw is None:
            price_raw = item.get('Index')

        ref_raw = item.get('refPrice')
        if ref_raw is None:
            ref_raw = item.get('RefPrice')
        if ref_raw is None:
            ref_raw = item.get('ref')
        if ref_raw is None:
            ref_raw = item.get('PrevIndex')

        try:
            price_val = float(price_raw) if price_raw is not None else 0.0
        except Exception:
            price_val = 0.0

        try:
            ref_val = float(ref_raw) if ref_raw is not None else 0.0
        except Exception:
            ref_val = 0.0

        normalized = dict(item)
        normalized['symbol'] = symbol_u
        normalized['price'] = price_val
        normalized['refPrice'] = ref_val
        return normalized

    @classmethod
    def _extract_index_items_from_payload(cls, payload: Any) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []

        def collect(node: Any):
            if isinstance(node, list):
                for x in node:
                    collect(x)
                return

            if isinstance(node, dict):
                normalized = cls._normalize_index_item(node)
                if normalized:
                    candidates.append(normalized)

                for key in ('data', 'Data', 'payload', 'Payload', 'items', 'Items', 'result', 'Result'):
                    if key in node:
                        collect(node.get(key))

        collect(payload)

        by_symbol: Dict[str, Dict[str, Any]] = {}
        for item in candidates:
            by_symbol[str(item.get('symbol')).upper()] = item
        return list(by_symbol.values())

    @classmethod
    def _update_indices_cache(cls, items: List[Dict[str, Any]], source: str):
        if not items:
            return

        cls._indices_cache = items
        cls._indices_last_update = time.time()
        cls._indices_source = source

        for item in items:
            sym = item.get('symbol')
            val = item.get('price')
            if not sym or val is None:
                continue
            try:
                fv = float(val)
            except Exception:
                continue
            history = cls._indices_history.setdefault(str(sym), [])
            history.append(fv)
            if len(history) > cls._HISTORY_SIZE:
                cls._indices_history[str(sym)] = history[-cls._HISTORY_SIZE:]

    @classmethod
    def _fetch_indices_rest(cls) -> List[Dict[str, Any]]:
        payload = {"symbols": cls.INDEX_SYMBOLS}
        response = cls._session.post(cls.INDEX_REST_URL, json=payload, timeout=3)
        if response.status_code != 200:
            return []
        raw = response.json() or []
        return cls._extract_index_items_from_payload(raw)

    @classmethod
    def _background_refresh_loop(cls):
        """Infinite loop to keep the RAM cache fresh every 12 seconds"""
        print(">>> [VCI] Starting background price refresh thread...", flush=True)
        while True:
            try:
                cls.update_bulk_cache()
            except Exception as e:
                logger.error(f"Error in background price refresh: {e}")
            
            # Sleep for 12 seconds between full updates
            time.sleep(12)

    @classmethod
    def _indices_refresh_loop(cls):
        """Background loop: keep indices fresh with REST fallback when WS is idle/unavailable."""
        print(">>> [VCI] Starting background INDICES refresh thread (fallback REST)...", flush=True)
        while True:
            try:
                # If WS has updated recently, skip REST call
                if cls._indices_last_update > 0 and (time.time() - cls._indices_last_update) < 2.5:
                    time.sleep(1)
                    continue

                items = cls._fetch_indices_rest()
                if items:
                    cls._update_indices_cache(items, source='REST')
            except Exception as e:
                logger.error(f"[VCI] Indices background refresh error: {e}")
            time.sleep(3)

    @classmethod
    def _indices_ws_loop(cls):
        """Socket.IO listener for Vietcap realtime indices."""
        if socketio is None:
            logger.info("[VCI] python-socketio not installed; skip WS indices stream.")
            return

        while True:
            sio = None
            try:
                sio = socketio.Client(reconnection=True, logger=False, engineio_logger=False)

                def _consume(payload: Any):
                    try:
                        items = cls._extract_index_items_from_payload(payload)
                        if items:
                            cls._update_indices_cache(items, source='SOCKET_IO')
                    except Exception:
                        return

                subscribe_payloads = [
                    {'symbols': cls.INDEX_SYMBOLS},
                    {'indexes': cls.INDEX_SYMBOLS},
                    {'symbol': cls.INDEX_SYMBOLS},
                ]

                @sio.event
                def connect():
                    logger.info("[VCI] Connected to Vietcap Socket.IO for indices.")
                    for event_name in ('subscribe', 'sub', 'join', 'reg', 'register', 'watch', 'indices'):
                        for payload in subscribe_payloads:
                            try:
                                sio.emit(event_name, payload)
                            except Exception:
                                continue

                @sio.event
                def connect_error(data):
                    logger.warning(f"[VCI] Socket.IO connect_error: {data}")

                @sio.event
                def disconnect():
                    logger.warning("[VCI] Socket.IO disconnected.")

                for event_name in (
                    'message',
                    'price',
                    'prices',
                    'index',
                    'indices',
                    'marketIndex',
                    'marketIndices',
                    'market_index',
                    'market_indices',
                    'ticker',
                    'tickers',
                    'data',
                    'update',
                ):
                    sio.on(event_name, handler=_consume)

                sio.connect(
                    cls.SOCKET_BASE_URL,
                    transports=['websocket'],
                    socketio_path=cls.SOCKET_PATH,
                    wait_timeout=8,
                    headers={
                        'Origin': 'https://trading.vietcap.com.vn',
                        'Referer': 'https://trading.vietcap.com.vn/',
                        'User-Agent': cls.HEADERS.get('User-Agent', ''),
                    },
                )
                sio.wait()
            except Exception as exc:
                logger.warning(f"[VCI] Socket.IO indices loop error: {exc}")
                time.sleep(2)
            finally:
                try:
                    if sio is not None:
                        sio.disconnect()
                except Exception:
                    pass

    @classmethod
    def ensure_indices_refresh(cls):
        """Start background indices refresh thread once"""
        if not cls._indices_thread_started:
            with cls._lock:
                if not cls._indices_thread_started:
                    # Do a blocking first fetch so cache is ready before first request
                    try:
                        items = cls._fetch_indices_rest()
                        if items:
                            cls._update_indices_cache(items, source='REST')
                    except Exception as e:
                        logger.warning(f"[VCI] Initial indices fetch failed: {e}")

                    if socketio is not None and not cls._indices_ws_thread_started:
                        ws_thread = threading.Thread(target=cls._indices_ws_loop, daemon=True)
                        ws_thread.start()
                        cls._indices_ws_thread_started = True
                        print(">>> [VCI] Indices Socket.IO thread spawned.", flush=True)

                    thread = threading.Thread(target=cls._indices_refresh_loop, daemon=True)
                    thread.start()
                    cls._indices_thread_started = True
                    print(">>> [VCI] Indices background thread spawned.", flush=True)

    @classmethod
    def get_cached_indices(cls) -> List[Dict]:
        """Return market indices from RAM (no network call, updated in background)"""
        cls.ensure_indices_refresh()
        return cls._indices_cache

    @classmethod
    def get_indices_history(cls) -> Dict[str, List[float]]:
        """Return historical points for sparklines from RAM"""
        return cls._indices_history

    @classmethod
    def get_indices_source(cls) -> str:
        """Current source of indices cache (SOCKET_IO/REST/EMPTY)."""
        return cls._indices_source

    @classmethod
    def ensure_background_refresh(cls):
        """Ensures the background refresh thread is running (called on first access)"""
        if not cls._refresh_thread_started:
            with cls._lock:
                if not cls._refresh_thread_started:
                    thread = threading.Thread(target=cls._background_refresh_loop, daemon=True)
                    thread.start()
                    cls._refresh_thread_started = True
                    print(">>> [VCI] Background thread spawned.", flush=True)

    @classmethod
    def get_price(cls, symbol: str) -> Optional[float]:
        """Get instant price from RAM"""
        detail = cls.get_price_detail(symbol)
        if detail:
            return detail.get('price')
        return None

    @classmethod
    def get_price_detail(cls, symbol: str) -> Optional[Dict[str, Any]]:
        """Get full price detail from RAM (refreshed in background)"""
        symbol = symbol.upper()
        cls.ensure_background_refresh()
        
        # 1. Try RAM Cache
        item = cls._price_cache.get(symbol)
        if item:
            # Normalize field names to match what the app expects
            return {
                'symbol': item.get('s'),
                'price': float(item.get('c') or item.get('ref') or item.get('op') or 0),
                'ref_price': float(item.get('ref') or 0),
                'ceiling': float(item.get('cei') or 0),
                'floor': float(item.get('flo') or 0),
                'open': float(item.get('op') or 0),
                'high': float(item.get('h') or 0),
                'low': float(item.get('l') or 0),
                'volume': float(item.get('vo') or 0),
                'value': float(item.get('va') or 0),
                'source': 'VCI_RAM'
            }

        # 2. Direct Fallback if not in cache (fresh boot or rare ticker)
        try:
            url = f"{cls.BASE_URL}/ticker/price/{symbol}"
            response = cls._session.get(url, timeout=3)
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    it = data[0]
                    return {
                        'symbol': it.get('s'),
                        'price': float(it.get('c') or it.get('ref') or 0),
                        'ref_price': float(it.get('ref') or 0),
                        'open': float(it.get('op') or 0),
                        'source': 'VCI_DIRECT'
                    }
        except Exception:
            pass
        return None

    @classmethod
    def _fetch_group_prices(cls, group: str) -> Dict[str, Dict]:
        """Fetch all prices for a specific exchange group from Vietcap"""
        try:
            url = f"{cls.BASE_URL}/tickers/price/group"
            response = cls._session.post(url, json={"group": group}, timeout=5)
            if response.status_code == 200:
                data = response.json()
                return { item['s']: item for item in data if 's' in item }
        except Exception as e:
            logger.error(f"Failed to fetch group {group}: {e}")
        return {}

    @classmethod
    def get_market_indices(cls) -> List[Dict]:
        """Return market indices from RAM cache (zero latency) - background thread keeps it fresh"""
        return cls.get_cached_indices()

    @classmethod
    def update_bulk_cache(cls):
        """Update the RAM cache with data from all exchanges"""
        from concurrent.futures import ThreadPoolExecutor
        groups = ['HOSE', 'HNX', 'UPCOM']
        new_cache = {}
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            results = executor.map(cls._fetch_group_prices, groups)
            for res in results:
                new_cache.update(res)
        
        if new_cache:
            cls._price_cache = new_cache
            cls._last_cache_update = time.time()
            print(f">>> [VCI] RAM Cache Updated: {len(new_cache)} symbols", flush=True)

    @classmethod
    def get_multiple_prices(cls, symbols: List[str]) -> Dict[str, float]:
        """Get prices for multiple symbols instantly from RAM"""
        cls.ensure_background_refresh()
        results = {}
        for symbol in symbols:
            price = cls.get_price(symbol)
            if price:
                results[symbol.upper()] = price
        return results
