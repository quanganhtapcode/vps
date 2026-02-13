/**
 * API Configuration and Helper Functions
 * Connects to the existing Python backend (server.py)
 */

// Re-export types and stock-specific API functions
export * from './types';
export * from './stockApi';


// API Base URL - prefer same-origin proxy (/api) for consistent caching/CORS
// Can be overridden via NEXT_PUBLIC_API_URL environment variable
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// API Endpoints
export const API = {
    // Market Data (CafeF Proxy)
    PE_CHART: `${API_BASE}/market/pe-chart`,
    REALTIME: `${API_BASE}/market/realtime`,
    INDICES: `${API_BASE}/market/indices`,
    REALTIME_CHART: `${API_BASE}/market/realtime-chart`,
    REALTIME_MARKET: `${API_BASE}/market/realtime-market`,
    REPORTS: `${API_BASE}/market/reports`,
    NEWS: `${API_BASE}/market/news`,
    TOP_MOVERS: `${API_BASE}/market/top-movers`,
    FOREIGN_FLOW: `${API_BASE}/market/foreign-flow`,
    GOLD: `${API_BASE}/market/gold`,
    LOTTERY: `${API_BASE}/market/lottery`,

    // Stock Data (VCI Source via vnstock)
    STOCK: (symbol: string) => `${API_BASE}/stock/${symbol}`,
    APP_DATA: (symbol: string) => `${API_BASE}/app-data/${symbol}`,
    CURRENT_PRICE: (symbol: string) => `${API_BASE}/current-price/${symbol}`,
    PRICE: (symbol: string) => `${API_BASE}/price/${symbol}`,
    HISTORICAL_CHART: (symbol: string) => `${API_BASE}/historical-chart-data/${symbol}`,
    STOCK_HISTORY: (symbol: string) => `${API_BASE}/stock/history/${symbol}`,
    COMPANY_PROFILE: (symbol: string) => `${API_BASE}/company/profile/${symbol}`,
    NEWS_STOCK: (symbol: string) => `${API_BASE}/news/${symbol}`,
    EVENTS: (symbol: string) => `${API_BASE}/events/${symbol}`,

    // Valuation
    VALUATION: (symbol: string) => `${API_BASE}/valuation/${symbol}`,

    // Utilities
    TICKERS: `${API_BASE}/tickers`,
    HEALTH: `${API_BASE}/health`,
} as const;

// Index mapping from CafeF
export const INDEX_MAP: Record<string, { id: string; name: string }> = {
    '1': { id: 'vnindex', name: 'VN-Index' },
    '2': { id: 'hnx', name: 'HNX-Index' },
    '9': { id: 'upcom', name: 'UPCOM' },
    '11': { id: 'vn30', name: 'VN30' },
};

// ============ API Fetching Functions ============

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        throw error;
    }
}

// ============ Market Data Types ============

export interface MarketIndexData {
    CurrentIndex: number;
    PrevIndex: number;
    Volume?: number;
    Value?: number;
}

export interface ChartPoint {
    Data: number;
    Time?: string;
}

export interface NewsItem {
    Title: string;
    Link?: string;
    NewsUrl?: string;
    ImageThumb?: string;
    Avatar?: string;
    PostDate?: string;
    PublishDate?: string;
    Symbol?: string;
    Price?: number;
    ChangePrice?: number;
}

export interface TopMoverItem {
    Symbol: string;
    CompanyName: string;
    CurrentPrice: number;
    ChangePricePercent: number;
    Exchange?: string;
    Value?: number;
}

export interface GoldPriceItem {
    Id: number;
    TypeName: string;
    BranchName: string;
    Buy: string;
    Sell: string;
    UpdateTime: string;
}

export interface PEChartData {
    date: Date;
    pe: number;
    vnindex: number;
}

// ============ Market Data Fetchers ============

/**
 * Fetch all indices data with realtime prices
 */
export async function fetchAllIndices(): Promise<Record<string, MarketIndexData>> {
    const response = await fetchAPI<Record<string, MarketIndexData>>(
        `${API.REALTIME_MARKET}?indices=1;2;9;11`
    );
    return response;
}

/**
 * Fetch sparkline chart data for an index
 */
export async function fetchIndexChart(indexId: string): Promise<ChartPoint[]> {
    const response = await fetchAPI<Record<string, ChartPoint[]>>(
        `${API.REALTIME_CHART}?index=${indexId}`
    );
    return response[indexId] || [];
}

/**
 * Fetch market news
 */
export async function fetchNews(page: number = 1, size: number = 100): Promise<NewsItem[]> {
    interface NewsResponse {
        Data?: NewsItem[];
    }
    const response = await fetchAPI<NewsResponse | NewsItem[]>(
        `${API.NEWS}?page=${page}&size=${size}`
    );

    if (Array.isArray(response)) {
        return response;
    }
    return response.Data || [];
}

/**
 * Fetch top movers (gainers/losers)
 */
export async function fetchTopMovers(type: 'UP' | 'DOWN', centerID: string = 'HOSE'): Promise<TopMoverItem[]> {
    interface TopMoversResponse {
        Data?: TopMoverItem[];
    }
    const response = await fetchAPI<TopMoversResponse>(
        `${API.TOP_MOVERS}?centerID=${centerID}&type=${type}`
    );
    return response.Data || [];
}

/**
 * Fetch foreign investor flow
 */
export async function fetchForeignFlow(type: 'buy' | 'sell'): Promise<TopMoverItem[]> {
    interface ForeignFlowResponse {
        Data?: TopMoverItem[];
    }
    const response = await fetchAPI<ForeignFlowResponse>(
        `${API.FOREIGN_FLOW}?type=${type}`
    );
    return response.Data || [];
}

/**
 * Fetch gold prices from BTMC
 */
export async function fetchGoldPrices(): Promise<{ data: GoldPriceItem[]; updated_at?: string }> {
    interface GoldResponse {
        success: boolean;
        data: GoldPriceItem[];
        updated_at?: string;
    }
    const response = await fetchAPI<GoldResponse>(API.GOLD);
    return {
        data: response.data || [],
        updated_at: response.updated_at
    };
}

/**
 * Fetch P/E chart historical data
 */
export async function fetchPEChart(): Promise<PEChartData[]> {
    interface PEChartResponse {
        Data?: {
            DataChart?: Array<{
                TimeStamp: number;
                Index: number;
                Pe: number;
            }>;
        };
    }

    const response = await fetchAPI<PEChartResponse>(API.PE_CHART);

    if (response.Data?.DataChart) {
        const data = response.Data.DataChart.map(p => ({
            date: new Date(p.TimeStamp * 1000),
            vnindex: p.Index,
            pe: p.Pe,
        })).reverse();

        // Ensure ascending order (old -> new)
        if (data.length > 1 && data[0].date > data[1].date) {
            data.reverse();
        }

        return data;
    }

    return [];
}

/**
 * Fetch lottery results
 */
export interface LotteryResult {
    title?: string;
    pubDate?: string;
    results: {
        DB?: string[];
        G1?: string[];
        G2?: string[];
        G3?: string[];
        G4?: string[];
        G5?: string[];
        G6?: string[];
        G7?: string[];
        G8?: string[];
        provinces?: Array<{
            name: string;
            prizes: Record<string, string[]>;
        }>;
    };
}

export async function fetchLottery(region: 'mb' | 'mn' | 'mt'): Promise<LotteryResult> {
    const response = await fetchAPI<LotteryResult>(`${API.LOTTERY}?region=${region}`);
    return response;
}

// ============ Utility Functions ============

/**
 * Format date from various formats (including CafeF /Date()/ format)
 */
export function formatDate(dateStr: string | number | undefined): string {
    if (!dateStr) return '';

    try {
        let date: Date;

        if (typeof dateStr === 'string' && dateStr.includes('/Date(')) {
            const ms = parseInt(dateStr.match(/\d+/)?.[0] || '0');
            date = new Date(ms);
        } else {
            date = new Date(dateStr);
        }

        return date.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '';
    }
}

/**
 * Format number with Vietnamese locale
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return value.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        ...options
    });
}

/**
 * Format currency (VND)
 */
export function formatCurrency(value: number): string {
    return formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Format percentage change with sign
 */
export function formatPercentChange(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}
