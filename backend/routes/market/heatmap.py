from __future__ import annotations

import logging
import os
import sqlite3

from flask import Blueprint, jsonify, request

from .deps import cache_func, cache_ttl
from .paths import screener_db_path

logger = logging.getLogger(__name__)

_SECTOR_SHORTNAMES: dict[str, str] = {
    'Ngân hàng': 'Ngân hàng',
    'Bất động sản': 'BĐS',
    'Thực phẩm và đồ uống': 'Thực phẩm',
    'Dịch vụ tài chính': 'Tài chính',
    'Điện, nước & xăng dầu khí đốt': 'Điện & NL',
    'Du lịch và Giải trí': 'Du lịch',
    'Dầu khí': 'Dầu khí',
    'Hóa chất': 'Hóa chất',
    'Tài nguyên Cơ bản': 'Tài nguyên',
    'Hàng & Dịch vụ Công nghiệp': 'Công nghiệp',
    'Xây dựng và Vật liệu': 'Xây dựng',
    'Bán lẻ': 'Bán lẻ',
    'Công nghệ Thông tin': 'CNTT',
    'Bảo hiểm': 'Bảo hiểm',
    'Hàng cá nhân & Gia dụng': 'Tiêu dùng',
    'Viễn thông': 'Viễn thông',
    'Y tế': 'Y tế',
    'Tiện ích cộng đồng': 'Tiện ích',
}


def register(market_bp: Blueprint) -> None:
    @market_bp.route('/heatmap', methods=['GET'])
    def api_market_heatmap():
        """HOSE stock heatmap data grouped by sector, sized by market cap."""
        exchange = request.args.get('exchange', 'HSX')
        limit = min(int(request.args.get('limit', '150')), 300)
        cache_key = f'heatmap_{exchange}_{limit}'

        def fetch_heatmap():
            db = screener_db_path()
            if not db or not os.path.exists(db):
                return {'sectors': []}

            with sqlite3.connect(db) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    'SELECT ticker, viSector, marketCap, dailyPriceChangePercent, marketPrice '
                    'FROM screening_data '
                    'WHERE exchange = ? AND marketCap > 0 AND viSector IS NOT NULL '
                    'ORDER BY marketCap DESC LIMIT ?',
                    (exchange, limit),
                ).fetchall()

            # Group by sector
            sector_map: dict[str, list] = {}
            for r in rows:
                s = r['viSector'] or 'Khác'
                if s not in sector_map:
                    sector_map[s] = []
                sector_map[s].append({
                    'ticker': r['ticker'],
                    'cap': r['marketCap'],
                    'change': round(r['dailyPriceChangePercent'] or 0, 4),
                    'price': r['marketPrice'] or 0,
                })

            sectors = []
            for name, stocks in sector_map.items():
                total_cap = sum(s['cap'] for s in stocks)
                avg_change = (
                    sum(s['change'] * s['cap'] for s in stocks) / total_cap
                    if total_cap > 0 else 0
                )
                sectors.append({
                    'name': name,
                    'shortName': _SECTOR_SHORTNAMES.get(name, name[:6]),
                    'totalCap': total_cap,
                    'avgChange': round(avg_change, 4),
                    'stocks': sorted(stocks, key=lambda x: x['cap'], reverse=True),
                })

            sectors.sort(key=lambda x: x['totalCap'], reverse=True)
            return {'sectors': sectors}

        try:
            data, _ = cache_func()(cache_key, cache_ttl().get('realtime', 45), fetch_heatmap)
            return jsonify(data)
        except Exception as e:
            logger.error(f'heatmap error: {e}')
            return jsonify({'sectors': []})
