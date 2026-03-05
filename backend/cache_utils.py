"""
Simple TTL Cache Implementation
Fast in-memory caching without external dependencies
"""
import time
import threading
from functools import wraps
from typing import Any, Optional, Callable
import logging

logger = logging.getLogger(__name__)


class TTLCache:
    """Thread-safe TTL cache with automatic expiration"""
    
    def __init__(self):
        self._cache = {}
        self._lock = threading.RLock()
        self._hits = 0
        self._misses = 0
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        with self._lock:
            if key in self._cache:
                value, expires_at = self._cache[key]
                if time.time() < expires_at:
                    self._hits += 1
                    logger.debug(f"Cache HIT: {key}")
                    return value
                else:
                    # Expired, remove it
                    del self._cache[key]
            
            self._misses += 1
            logger.debug(f"Cache MISS: {key}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set cached value with TTL in seconds"""
        with self._lock:
            expires_at = time.time() + ttl
            self._cache[key] = (value, expires_at)
            logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
    
    def delete(self, key: str):
        """Delete cached value"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                logger.debug(f"Cache DELETE: {key}")
    
    def clear(self):
        """Clear all cache"""
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0
            logger.info("Cache CLEARED")
    
    def cleanup(self):
        """Remove expired entries"""
        with self._lock:
            now = time.time()
            expired_keys = [
                key for key, (_, expires_at) in self._cache.items()
                if now >= expires_at
            ]
            for key in expired_keys:
                del self._cache[key]
            
            if expired_keys:
                logger.info(f"Cache cleanup: removed {len(expired_keys)} expired entries")
    
    def stats(self) -> dict:
        """Get cache statistics"""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            
            return {
                'size': len(self._cache),
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': f"{hit_rate:.1f}%"
            }


# Global cache instance
_global_cache = TTLCache()


def cache_get(key: str) -> Optional[Any]:
    """Get value from global cache"""
    return _global_cache.get(key)


def cache_set(key: str, value: Any, ttl: int = 300):
    """Set value in global cache"""
    _global_cache.set(key, value, ttl)


def cache_delete(key: str):
    """Delete value from global cache"""
    _global_cache.delete(key)


def cache_clear():
    """Clear global cache"""
    _global_cache.clear()


def cache_stats() -> dict:
    """Get global cache statistics"""
    return _global_cache.stats()


def cached(ttl: int = 300, key_func: Optional[Callable] = None):
    """
    Decorator for caching function results
    
    Args:
        ttl: Time to live in seconds
        key_func: Optional function to generate cache key from args
    
    Example:
        @cached(ttl=60)
        def get_gold_prices():
            return expensive_api_call()
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default: function name + args
                cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cached_value = _global_cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            _global_cache.set(cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


# Auto-cleanup thread
def _start_cleanup_thread():
    """Start background thread to cleanup expired cache entries"""
    def cleanup_loop():
        while True:
            time.sleep(60)  # Cleanup every minute
            _global_cache.cleanup()
    
    thread = threading.Thread(target=cleanup_loop, daemon=True)
    thread.start()
    logger.info("Cache cleanup thread started")


# Start cleanup on module load
_start_cleanup_thread()
