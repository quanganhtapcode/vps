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
    _indices_history: Dict[str, List[float]] = {} # symbol -> [p1, p2, p3... p30]
    _HISTORY_SIZE = 30
    
    # Background refresh state
    _refresh_thread_started = False
    _indices_thread_started = False
    _lock = threading.Lock()

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
        """Background loop: fetch VCI market indices every 1s and store in RAM"""
        print(">>> [VCI] Starting background INDICES refresh thread (1s)...", flush=True)
        while True:
            try:
                url = "https://trading.vietcap.com.vn/api/price/marketIndex/getList"
                payload = {"symbols": ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]}
                response = cls._session.post(url, json=payload, timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    if data:
                        cls._indices_cache = data
                        cls._indices_last_update = time.time()
                        
                        # Update history for sparklines
                        for item in data:
                            sym = item.get('symbol')
                            val = item.get('price')
                            if sym and val is not None:
                                if sym not in cls._indices_history:
                                    cls._indices_history[sym] = []
                                history = cls._indices_history[sym]
                                history.append(float(val))
                                if len(history) > cls._HISTORY_SIZE:
                                    cls._indices_history[sym] = history[-cls._HISTORY_SIZE:]
            except Exception as e:
                logger.error(f"[VCI] Indices background refresh error: {e}")
            time.sleep(3)

    @classmethod
    def ensure_indices_refresh(cls):
        """Start background indices refresh thread once"""
        if not cls._indices_thread_started:
            with cls._lock:
                if not cls._indices_thread_started:
                    # Do a blocking first fetch so cache is ready before first request
                    try:
                        url = "https://trading.vietcap.com.vn/api/price/marketIndex/getList"
                        payload = {"symbols": ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]}
                        resp = cls._session.post(url, json=payload, timeout=5)
                        if resp.status_code == 200:
                            cls._indices_cache = resp.json()
                            cls._indices_last_update = time.time()
                    except Exception as e:
                        logger.warning(f"[VCI] Initial indices fetch failed: {e}")
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
