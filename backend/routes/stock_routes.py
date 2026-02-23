"""Stock routes blueprint (bootstrap).

This file intentionally stays small: it creates the Flask blueprint and
registers route groups implemented in backend/routes/stock/.

Public contract:
- Exports `stock_bp` for backend/server.py and backend/routes/__init__.py.
"""

from __future__ import annotations
import logging
from flask import Blueprint
from backend.routes.stock import register_stock_routes

logger = logging.getLogger(__name__)

# Single source of truth for the stock blueprint
stock_bp = Blueprint("stock", __name__)

# Register all sub-modules (prices, profile, financials, valuation, etc.)
register_stock_routes(stock_bp)
