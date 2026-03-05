from __future__ import annotations

import time
from typing import Any


_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 600  # 10 minutes


def cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def cache_set(key: str, data: Any) -> None:
    _cache[key] = (time.time(), data)
    # Evict old entries if cache grows too large (>500 entries)
    if len(_cache) > 500:
        cutoff = time.time() - _CACHE_TTL
        keys_to_del = [k for k, (t, _) in _cache.items() if t < cutoff]
        for k in keys_to_del:
            _cache.pop(k, None)
