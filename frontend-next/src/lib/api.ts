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
    // Market Data
    PE_CHART: `${API_BASE}/market/pe-chart`,
    VCI_INDICES: `${API_BASE}/market/vci-indices`,
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
        const resolvedUrl =
            typeof window === 'undefined' && url.startsWith('/')
                ? new URL(
                      url,
                      process.env.NEXT_PUBLIC_SITE_URL ||
                          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
                  ).toString()
                : url;

        const response = await fetch(resolvedUrl, {
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
    Advances?: number;
    Declines?: number;
    NoChanges?: number;
    Ceilings?: number;
    Floors?: number;
}

export interface VciIndexItem {
    symbol: string;
    price: number;
    refPrice: number;
    change?: number;
    changePercent?: number;
    time?: string;
    sendingTime?: string;
    totalShares?: number;
    totalValue?: number;
    totalStockIncrease?: number;
    totalStockDecline?: number;
    totalStockNoChange?: number;
    totalStockCeiling?: number;
    totalStockFloor?: number;
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

export type IndicesStreamStatus = 'open' | 'closed' | 'error';

interface IndicesStreamPayload {
    type?: string;
    source?: string;
    serverTs?: number;
    data?: Record<string, MarketIndexData>;
}

// ============ Market Data Fetchers ============

/**
 * Fetch all indices data with realtime prices
 */
export async function fetchAllIndices(): Promise<Record<string, MarketIndexData>> {
    // Single call: VCI indices already includes VNINDEX/HNX/UPCOM/VN30
    const items = await fetchAPI<VciIndexItem[]>(API.VCI_INDICES);
    const bySymbol = new Map<string, VciIndexItem>();
    for (const it of items || []) {
        if (it?.symbol) bySymbol.set(String(it.symbol).toUpperCase(), it);
    }

    const symbolMap: Record<string, string> = {
        '1': 'VNINDEX',
        '2': 'HNXINDEX',
        '9': 'HNXUPCOMINDEX',
        '11': 'VN30',
    };

    const result: Record<string, MarketIndexData> = {};
    for (const [indexId, vciSymbol] of Object.entries(symbolMap)) {
        const it = bySymbol.get(vciSymbol);
        if (!it) continue;
        result[indexId] = {
            CurrentIndex: Number(it.price) || 0,
            PrevIndex: Number(it.refPrice) || 0,
            Volume: Number(it.totalShares) || 0,
            Value: Number(it.totalValue) || 0,
            Advances: Number(it.totalStockIncrease) || 0,
            Declines: Number(it.totalStockDecline) || 0,
            NoChanges: Number(it.totalStockNoChange) || 0,
            Ceilings: Number(it.totalStockCeiling) || 0,
            Floors: Number(it.totalStockFloor) || 0,
        };
    }
    return result;
}

function getIndicesWsUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_BACKEND_WS_URL;
    if (fromEnv) {
        return `${fromEnv.replace(/\/$/, '')}/ws/market/indices`;
    }

    const fromApiEnv = process.env.NEXT_PUBLIC_API_URL;
    if (fromApiEnv && /^https?:\/\//i.test(fromApiEnv)) {
        try {
            const parsed = new URL(fromApiEnv);
            const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${wsProtocol}//${parsed.host}/ws/market/indices`;
        } catch {
            // fall through to runtime-based defaults
        }
    }

    if (typeof window !== 'undefined') {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
            return 'ws://127.0.0.1:5000/ws/market/indices';
        }
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}/ws/market/indices`;
    }

    return 'ws://127.0.0.1:5000/ws/market/indices';
}

export function subscribeIndicesStream(options: {
    onData: (data: Record<string, MarketIndexData>, source?: string) => void;
    onStatus?: (status: IndicesStreamStatus) => void;
}): () => void {
    const { onData, onStatus } = options;
    const ws = new WebSocket(getIndicesWsUrl());

    ws.onopen = () => {
        onStatus?.('open');
    };

    ws.onerror = () => {
        onStatus?.('error');
    };

    ws.onclose = () => {
        onStatus?.('closed');
    };

    ws.onmessage = (event) => {
        try {
            const payload = JSON.parse(String(event.data)) as IndicesStreamPayload;
            if (payload?.type !== 'indices' || !payload?.data) return;
            onData(payload.data, payload.source);
        } catch {
            // ignore malformed payloads
        }
    };

    return () => {
        try {
            ws.close();
        } catch {
            // noop
        }
    };
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

function parseDateInput(input: string | number | Date | undefined | null): Date | null {
    if (input == null) return null;
    if (input instanceof Date) {
        return isNaN(input.getTime()) ? null : input;
    }

    if (typeof input === 'number') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
    }

    let value = String(input).trim();
    if (!value) return null;

    // CafeF style: \/Date(1700000000000)\/
    if (value.includes('/Date(')) {
        const ms = parseInt(value.match(/\d+/)?.[0] || '0', 10);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }

    // Some sources append timezone like: "Feb 21, 2026, 06:09 PM | +03:02"
    if (value.includes('|')) {
        value = value.split('|')[0]?.trim() || value;
    }

    // Try native parsing first (ISO, RFC2822, etc.)
    let d = new Date(value);
    if (!isNaN(d.getTime())) return d;

    // Try dd/mm/yyyy[ hh:mm[:ss]] (common Vietnamese format)
    const m = value.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const year = parseInt(m[3], 10);
        const hour = m[4] ? parseInt(m[4], 10) : 0;
        const minute = m[5] ? parseInt(m[5], 10) : 0;
        const second = m[6] ? parseInt(m[6], 10) : 0;
        d = new Date(year, month, day, hour, minute, second);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}

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
 * Format time as relative text (e.g. "3 giờ trước", "2 ngày trước").
 */
export function formatRelativeTime(
    input: string | number | Date | undefined,
    locale: string = 'vi-VN'
): string {
    const date = parseDateInput(input);
    if (!date) return '';

    const now = new Date();
    const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
    const abs = Math.abs(diffSeconds);

    if (abs < 5) return locale.startsWith('vi') ? 'vừa xong' : 'just now';

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 60 * 60 * 24 * 365],
        ['month', 60 * 60 * 24 * 30],
        ['week', 60 * 60 * 24 * 7],
        ['day', 60 * 60 * 24],
        ['hour', 60 * 60],
        ['minute', 60],
        ['second', 1],
    ];

    for (const [unit, secondsInUnit] of units) {
        if (abs >= secondsInUnit || unit === 'second') {
            const value = Math.round(diffSeconds / secondsInUnit);
            return rtf.format(value, unit);
        }
    }

    return rtf.format(diffSeconds, 'second');
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
