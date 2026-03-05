from __future__ import annotations

import logging

import requests as http_requests
from flask import Blueprint, jsonify, request

from backend.data_sources.vci import VCIClient

from .deps import cache_func, cache_ttl
from .http_headers import CAFEF_HEADERS


logger = logging.getLogger(__name__)


_INDEX_ID_TO_VCI_SYMBOL = {
    '1': 'VNINDEX',
    '2': 'HNXIndex',
    '9': 'HNXUpcomIndex',
    '11': 'VN30',
}


def _find_vci_index_item(vci_symbol: str) -> dict | None:
    try:
        items = VCIClient.get_market_indices() or []
    except Exception:
        return None
    vci_symbol_u = str(vci_symbol).upper()
    for it in items:
        try:
            if str(it.get('symbol') or '').upper() == vci_symbol_u:
                return it
        except Exception:
            continue
    return None


def register(market_bp: Blueprint) -> None:
    @market_bp.route("/pe-chart")
    def api_market_pe_chart():
        def fetch_pe_chart():
            url = "https://cafef.vn/du-lieu/Ajax/PageNew/FinanceData/GetDataChartPE.ashx"
            response = http_requests.get(url, timeout=15, headers=CAFEF_HEADERS)
            response.raise_for_status()
            return response.json()

        try:
            data, is_cached = cache_func()("pe_chart", cache_ttl().get("pe_chart", 3600), fetch_pe_chart)
            resp = jsonify(data)
            resp.headers["X-Cache"] = "HIT" if is_cached else "MISS"
            return resp
        except Exception as e:
            logger.error(f"PE chart proxy error: {e}")
            return jsonify({"error": str(e)}), 500

    @market_bp.route("/foreign-flow")
    def api_market_foreign_flow():
        flow_type = request.args.get("type", "buy")
        cache_key = f"foreign_flow_{flow_type}"

        def fetch_foreign_flow():
            url = f"https://cafef.vn/du-lieu/ajax/mobile/smart/ajaxkhoingoai.ashx?type={flow_type}"
            response = http_requests.get(url, timeout=10, headers=CAFEF_HEADERS)
            response.raise_for_status()
            return response.json()

        try:
            data, is_cached = cache_func()(cache_key, cache_ttl().get("realtime", 45), fetch_foreign_flow)
            resp = jsonify(data)
            resp.headers["X-Cache"] = "HIT" if is_cached else "MISS"
            return resp
        except Exception as e:
            logger.error(f"Foreign flow proxy error: {e}")
            return jsonify({"Data": [], "Success": False})

    @market_bp.route("/realtime-chart")
    def api_market_realtime_chart():
        return jsonify({"success": False, "error": "Deprecated"}), 410

    @market_bp.route("/realtime-market")
    def api_market_realtime_market():
        return jsonify({"success": False, "error": "Deprecated"}), 410

    @market_bp.route("/realtime")
    def api_market_realtime_legacy():
        return jsonify({"success": False, "error": "Deprecated: use /api/market/vci-indices"}), 410

    @market_bp.route("/indices")
    def api_market_indices_legacy():
        return jsonify({"success": False, "error": "Deprecated: use /api/market/vci-indices"}), 410

    @market_bp.route("/reports")
    def api_market_reports_legacy():
        return jsonify({"success": False, "error": "Deprecated"}), 410
