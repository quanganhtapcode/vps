/**
 * Stock API Functions
 * Functions to fetch stock data from SQLite-backed Python backend
 */

import { API_BASE } from './api';
import type {
    Company,
    StockOverview,
    FinancialReportBase,
    PriceData,
    RealtimePrice,
    HistoricalChartData,
    SearchResult,
    StockListItem,
    DatabaseStats,
    DataFreshness,
    StockNews,
} from './types';

// ==================== COMPANY DATA ====================

/**
 * Get company profile by symbol
 */
export async function fetchCompanyProfile(symbol: string): Promise<Company | null> {
    try {
        const response = await fetch(`${API_BASE}/company/profile/${symbol}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching company profile for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get all companies, optionally filtered by exchange
 */
export async function fetchAllCompanies(exchange?: string): Promise<Company[]> {
    try {
        const url = exchange
            ? `${API_BASE}/companies?exchange=${exchange}`
            : `${API_BASE}/companies`;
        const response = await fetch(url);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Error fetching companies:', error);
        return [];
    }
}

/**
 * Search companies by symbol or name
 */
export async function searchCompanies(query: string, limit: number = 20): Promise<SearchResult[]> {
    try {
        const response = await fetch(`${API_BASE}/companies/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Error searching companies:', error);
        return [];
    }
}

// ==================== STOCK OVERVIEW ====================

/**
 * Get stock overview (ratios, metrics) by symbol
 */
export async function fetchStockOverview(symbol: string): Promise<StockOverview | null> {
    try {
        const response = await fetch(`${API_BASE}/stock/${symbol}`);
        if (!response.ok) return null;
        const data = await response.json();
        // Handle both direct response and {data: ...} wrapper
        return data.data || data;
    } catch (error) {
        console.error(`Error fetching stock overview for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get stock peers (industry comparison)
 */
export async function fetchStockPeers(symbol: string): Promise<any[]> {
    try {
        const response = await fetch(`${API_BASE}/stock/peers/${symbol}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error(`Error fetching stock peers for ${symbol}:`, error);
        return [];
    }
}

/**
 * Get overview for multiple symbols at once (batch request)
 */
export async function fetchBatchOverview(symbols: string[]): Promise<Record<string, StockOverview>> {
    try {
        const response = await fetch(`${API_BASE}/batch-overview?symbols=${symbols.join(',')}`);
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.error('Error fetching batch overview:', error);
        return {};
    }
}

// ==================== FINANCIAL STATEMENTS ====================

type ReportType = 'income' | 'balance' | 'cashflow' | 'ratio';
type PeriodType = 'quarter' | 'year';

/**
 * Get financial report (income, balance, cashflow, or ratio)
 */
export async function fetchFinancialReport(
    symbol: string,
    type: ReportType,
    period: PeriodType = 'quarter'
): Promise<FinancialReportBase[]> {
    try {
        const response = await fetch(
            `${API_BASE}/financial-report/${symbol}?type=${type}&period=${period}`
        );
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    } catch (error) {
        console.error(`Error fetching ${type} report for ${symbol}:`, error);
        return [];
    }
}

/**
 * Shortcut: Get income statement
 */
export async function fetchIncomeStatement(
    symbol: string,
    period: PeriodType = 'quarter'
): Promise<FinancialReportBase[]> {
    return fetchFinancialReport(symbol, 'income', period);
}

/**
 * Shortcut: Get balance sheet
 */
export async function fetchBalanceSheet(
    symbol: string,
    period: PeriodType = 'quarter'
): Promise<FinancialReportBase[]> {
    return fetchFinancialReport(symbol, 'balance', period);
}

/**
 * Shortcut: Get cash flow statement
 */
export async function fetchCashFlow(
    symbol: string,
    period: PeriodType = 'quarter'
): Promise<FinancialReportBase[]> {
    return fetchFinancialReport(symbol, 'cashflow', period);
}

/**
 * Shortcut: Get financial ratios
 */
export async function fetchRatios(
    symbol: string,
    period: PeriodType = 'quarter'
): Promise<FinancialReportBase[]> {
    return fetchFinancialReport(symbol, 'ratio', period);
}

// ==================== PRICE DATA ====================

/**
 * Get current/realtime price
 */
export async function fetchCurrentPrice(symbol: string): Promise<RealtimePrice | null> {
    try {
        const response = await fetch(`${API_BASE}/current-price/${symbol}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.data || data;
    } catch (error) {
        console.error(`Error fetching current price for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get historical price data
 */
export async function fetchPriceHistory(
    symbol: string,
    period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL' = '3M'
): Promise<PriceData[]> {
    try {
        const response = await fetch(`${API_BASE}/stock/history/${symbol}?period=${period}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.data || data.Data || data || [];
    } catch (error) {
        console.error(`Error fetching price history for ${symbol}:`, error);
        return [];
    }
}

/**
 * Get batch prices for multiple symbols
 */
export async function fetchBatchPrice(symbols: string[]): Promise<Record<string, RealtimePrice>> {
    try {
        const response = await fetch(`${API_BASE}/batch-price?symbols=${symbols.join(',')}`);
        if (!response.ok) return {};
        const data = await response.json();
        return data.data || data;
    } catch (error) {
        console.error('Error fetching batch prices:', error);
        return {};
    }
}

// ==================== HISTORICAL CHART DATA ====================

/**
 * Get historical ratio chart data (ROE, ROA, P/E, P/B, etc.)
 */
export async function fetchHistoricalChartData(symbol: string): Promise<HistoricalChartData | null> {
    try {
        const response = await fetch(`${API_BASE}/historical-chart-data/${symbol}`);
        if (!response.ok) return null;
        const json = await response.json();
        if (json.success && json.data) {
            return json.data;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching historical chart data for ${symbol}:`, error);
        return null;
    }
}

// ==================== NEWS ====================

/**
 * Get stock-related news
 */
export async function fetchStockNews(symbol: string): Promise<StockNews[]> {
    try {
        const response = await fetch(`${API_BASE}/news/${symbol}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.Data || data.data || data || [];
    } catch (error) {
        console.error(`Error fetching news for ${symbol}:`, error);
        return [];
    }
}

// ==================== DATABASE UTILITIES ====================

/**
 * Get list of all available symbols in database
 */
export async function fetchAvailableSymbols(): Promise<string[]> {
    try {
        const response = await fetch(`${API_BASE}/tickers`);
        if (!response.ok) return [];
        const data = await response.json();
        // Handle multiple possible response formats
        if (Array.isArray(data)) {
            return data.map(item => typeof item === 'string' ? item : item.symbol);
        }
        if (data.tickers) {
            return data.tickers.map((t: { symbol: string }) => t.symbol);
        }
        if (data.symbols) {
            return data.symbols;
        }
        return [];
    } catch (error) {
        console.error('Error fetching available symbols:', error);
        return [];
    }
}

/**
 * Get symbols by industry
 */
export async function fetchSymbolsByIndustry(industry: string): Promise<StockListItem[]> {
    try {
        const response = await fetch(`${API_BASE}/companies/industry/${encodeURIComponent(industry)}`);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error(`Error fetching symbols by industry ${industry}:`, error);
        return [];
    }
}

/**
 * Check data freshness for a symbol
 */
export async function checkDataFreshness(symbol: string): Promise<DataFreshness | null> {
    try {
        const response = await fetch(`${API_BASE}/stock/${symbol}/freshness`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error checking data freshness for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get database statistics
 */
export async function fetchDatabaseStats(): Promise<DatabaseStats | null> {
    try {
        const response = await fetch(`${API_BASE}/db/stats`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error fetching database stats:', error);
        return null;
    }
}

// ==================== VALUATION ====================

/**
 * Get valuation data (DCF inputs, multiples comparison) - GET (Legacy/Simple)
 */
export async function fetchValuationData(symbol: string): Promise<{
    dcf?: object;
    multiples?: object;
    peers?: object[];
} | null> {
    try {
        const response = await fetch(`${API_BASE}/valuation/${symbol}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching valuation data for ${symbol}:`, error);
        return null;
    }
}

/**
 * Calculate valuation with custom assumptions - POST
 */
export async function calculateValuation(symbol: string, assumptions: any): Promise<any> {
    try {
        const response = await fetch(`${API_BASE}/valuation/${symbol}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(assumptions),
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error calculating valuation for ${symbol}:`, error);
        return null;
    }
}

// ==================== EXPORT EXCEL ====================

/**
 * Get Excel export URL for a symbol
 */
export async function getExcelExportUrl(symbol: string): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE}/stock/excel/${symbol}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.success ? data.url : null;
    } catch (error) {
        console.error(`Error getting Excel URL for ${symbol}:`, error);
        return null;
    }
}
