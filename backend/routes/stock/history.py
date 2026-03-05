from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pandas as pd
from flask import Blueprint, jsonify, request
from vnstock import Quote

from backend.utils import validate_stock_symbol


logger = logging.getLogger(__name__)


def register(stock_bp: Blueprint) -> None:
    @stock_bp.route("/stock/history/<symbol>")
    def get_stock_history(symbol):
        """Get historical price data for charting (returns last 6M to 10Y based on param)."""
        try:
            is_valid, result = validate_stock_symbol(symbol)
            if not is_valid:
                return jsonify({"error": result, "success": False}), 400
            symbol = result

            try:
                quote = Quote(symbol=symbol, source="VCI")
                range_param = request.args.get("period", request.args.get("range", "6M")).upper()
                days_map = {"1M": 30, "3M": 90, "6M": 180, "1Y": 365, "5Y": 1825, "ALL": 3650}
                days_back = days_map.get(range_param, 180)

                end_date = datetime.now()
                start_date = end_date - timedelta(days=days_back)
                history_df = quote.history(
                    start=start_date.strftime("%Y-%m-%d"),
                    end=end_date.strftime("%Y-%m-%d"),
                    interval="1D",
                )
                if history_df is None or history_df.empty:
                    return jsonify({"success": False, "message": "No historical data available"}), 404

                history_df.columns = [c.lower() for c in history_df.columns]
                history_data = []
                date_col = next((c for c in ["time", "date", "tradingdate"] if c in history_df.columns), "time")
                for _, row in history_df.iterrows():
                    try:
                        d_val = row.get(date_col, row.name)
                        d_str = d_val.strftime("%Y-%m-%d") if hasattr(d_val, "strftime") else str(d_val).split(" ")[0]
                        history_data.append(
                            {
                                "date": d_str,
                                "open": float(row.get("open", 0)),
                                "high": float(row.get("high", 0)),
                                "low": float(row.get("low", 0)),
                                "close": float(row.get("close", 0)),
                                "volume": float(row.get("volume", 0)),
                            }
                        )
                    except Exception:
                        continue

                return jsonify({"symbol": symbol, "data": history_data, "count": len(history_data), "success": True})
            except Exception as e:
                logger.error(f"Error fetching history for {symbol}: {e}")
                return jsonify({"success": False, "error": str(e)}), 500
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    @stock_bp.route("/history/<symbol>")
    def api_history_legacy(symbol):
        """Legacy endpoint for history (flexible start/end dates)."""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365)
            start_str = request.args.get("start", start_date.strftime("%Y-%m-%d"))
            end_str = request.args.get("end", end_date.strftime("%Y-%m-%d"))

            quote = Quote(symbol=symbol, source="VCI")
            history_df = quote.history(start=start_str, end=end_str, interval="1D")
            if history_df is not None and not history_df.empty:
                if isinstance(history_df.index, pd.DatetimeIndex):
                    history_df = history_df.reset_index()
                history_data = history_df.to_dict(orient="records")
                for item in history_data:
                    for k, v in item.items():
                        if isinstance(v, (datetime, pd.Timestamp)):
                            item[k] = v.strftime("%Y-%m-%d")
                return jsonify({"success": True, "data": history_data})
            return jsonify({"success": True, "data": []})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500
