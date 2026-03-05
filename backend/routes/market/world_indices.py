from __future__ import annotations

import logging

import requests as http_requests
from flask import Blueprint, jsonify

from .deps import cache_func

logger = logging.getLogger(__name__)

_WORLD_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^GDAXI', '^FTSE', '^N225', '^HSI', '000001.SS']
_WORLD_NAMES = {
    '^GSPC': 'S&P 500',
    '^IXIC': 'NASDAQ',
    '^DJI': 'Dow Jones',
    '^GDAXI': 'DAX',
    '^FTSE': 'FTSE 100',
    '^N225': 'Nikkei 225',
    '^HSI': 'Hang Seng',
    '000001.SS': 'Shanghai',
}
_YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


def register(market_bp: Blueprint) -> None:
    @market_bp.route('/world-indices', methods=['GET'])
    def api_world_indices():
        """World stock indices from Yahoo Finance - cached 90s"""
        def fetch_world_indices():
            results = []
            for sym in _WORLD_SYMBOLS:
                try:
                    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=1d'
                    r = http_requests.get(url, timeout=6, headers=_YAHOO_HEADERS)
                    if r.status_code != 200:
                        continue
                    data = r.json()
                    meta = data['chart']['result'][0]['meta']
                    price = float(meta.get('regularMarketPrice') or 0)
                    prev = float(meta.get('chartPreviousClose') or meta.get('previousClose') or price)
                    change = round(price - prev, 2)
                    pct = round((change / prev) * 100, 2) if prev else 0
                    results.append({
                        'symbol': sym,
                        'name': _WORLD_NAMES.get(sym, sym),
                        'price': price,
                        'change': change,
                        'changePercent': pct,
                    })
                except Exception as e:
                    logger.warning(f'world-indices: failed {sym}: {e}')
            return results

        try:
            data, _ = cache_func()('world_indices', 90, fetch_world_indices)
            return jsonify(data or [])
        except Exception as e:
            logger.error(f'world-indices error: {e}')
            return jsonify([])
