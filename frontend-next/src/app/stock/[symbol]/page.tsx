'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { formatNumber, formatDate, formatPercentChange, fetchStockPeers } from '@/lib/api';
import styles from './page.module.css';
import OverviewTab from '@/components/StockDetail/OverviewTab';
import FinancialsTab from '@/components/StockDetail/FinancialsTab';
import PriceHistoryTab from '@/components/StockDetail/PriceHistoryTab';
import ValuationTab from '@/components/StockDetail/ValuationTab';
import AnalysisTab from '@/components/StockDetail/AnalysisTab';
import { Select, SelectItem } from '@tremor/react';
import { getTickerData } from '@/lib/tickerCache';

function classNames(...classes: Array<string | false | undefined | null>) {
    return classes.filter(Boolean).join(' ');
}

interface StockInfo {
    symbol: string;
    companyName: string;
    sector: string;
    exchange: string;
    overview?: {
        established?: string;
        listedDate?: string;
        employees?: number;
        website?: string;
        description?: string;
    };
}

interface PriceData {
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    value: number;
    ceiling: number;
    floor: number;
    ref: number;
}

interface HistoricalData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface FinancialData {
    eps?: number;
    pe?: number;
    pb?: number;
    roe?: number;
    roa?: number;
    marketCap?: number;
    bookValue?: number;
    dividend?: number;
    sharesOutstanding?: number;
    netProfitMargin?: number;
    profitGrowth?: number;
    debtToEquity?: number;
}

interface FinancialReportItem {
    "Năm"?: number;
    "Kỳ"?: number;
    year?: number;
    quarter?: number;
    [key: string]: any;
}

interface NewsItem {
    Title: string;
    Link?: string;
    NewsUrl?: string;
    PostDate?: string;
    PublishDate?: string;
}

export default function StockDetailPage() {
    const params = useParams();
    const symbol = (params.symbol as string)?.toUpperCase() || '';

    const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
    const [priceData, setPriceData] = useState<PriceData | null>(null);
    const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
    const [financials, setFinancials] = useState<FinancialData | null>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [timeRange, setTimeRange] = useState<'3M' | '6M' | '1Y' | '3Y' | '5Y'>('3M');
    const [isLoading, setIsLoading] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [isDescExpanded, setIsDescExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'valuation' | 'priceHistory' | 'analysis'>('overview');
    const [activeSubTab, setActiveSubTab] = useState<'ratio' | 'income' | 'balance' | 'cashflow'>('ratio');
    const [financialPeriod, setFinancialPeriod] = useState<'quarter' | 'year'>('quarter');
    const [financialReport, setFinancialReport] = useState<FinancialReportItem[]>([]);
    const [ratioData, setRatioData] = useState<any[]>([]);

    // New Pre-fetched States
    const [prefetchedValuation, setPrefetchedValuation] = useState<any>(null);
    const [prefetchedChartData, setPrefetchedChartData] = useState<any>(null); // For FinancialsTab
    const [prefetchedPeers, setPrefetchedPeers] = useState<any>(null); // For AnalysisTab
    const [rawOverviewData, setRawOverviewData] = useState<any>(null); // For FinancialsTab

    // New state for chart loading
    const [isChartLoading, setIsChartLoading] = useState(false);

    const handleDownloadExcel = async () => {
        try {
            const res = await fetch(`/api/stock/excel/${symbol}`);
            const data = await res.json();
            if (data.success && data.url) {
                window.open(data.url, '_blank');
            } else {
                alert('Không tìm thấy file dữ liệu Excel cho mã này.');
            }
        } catch (e) {
            console.error(e);
            alert('Lỗi tải file.');
        }
    };

    // 1. Fetch Static Data & Parallel Pre-fetching
    useEffect(() => {
        if (!symbol) return;

        async function loadData() {
            setIsLoading(true);
            setError(null);

            try {
                // PHASE 1: Fast data from DB/cache (ticker info, profile, stock overview)
                // PHASE 1: Fast data from local cache and summary DB
                const [tickerData, stockRes] = await Promise.all([
                    getTickerData(),
                    fetch(`/api/stock/${symbol}`).then(r => r.ok ? r.json() : null).catch(() => null)
                ]);

                // --- Process Ticker Info ---
                let baseInfo: StockInfo = {
                    symbol,
                    companyName: symbol,
                    sector: 'N/A',
                    exchange: 'N/A',
                };
                if (tickerData) {
                    const ticker = tickerData.tickers?.find(
                        (t: { symbol: string }) => t.symbol.toUpperCase() === symbol
                    );
                    if (ticker) {
                        baseInfo = {
                            symbol: ticker.symbol,
                            companyName: ticker.name,
                            sector: ticker.sector,
                            exchange: ticker.exchange,
                        };
                    }
                }

                setStockInfo(baseInfo);

                // PHASE 2: Background fetch for Profile (fallback)
                fetch(`/api/company/profile/${symbol}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(profileRes => {
                        if (profileRes && profileRes.company_profile) {
                            setStockInfo(prev => ({
                                ...prev!,
                                overview: { description: profileRes.company_profile }
                            }));
                        }
                    }).catch(() => null);

                // --- Process Stock Data from DB (fast) ---
                let currentPriceValue = 0;
                if (stockRes) {
                    const data = stockRes.data || stockRes;
                    // Use DB data for initial display
                    // Price Adjustment: If DB price is < 1000, it's likely in 'thousands VND' unit.
                    // Most stocks > 1000 VND. Exception: Penny stocks < 1000 are rare but exist.
                    // However, user specifically noted "missing 3 zeros" for values like 250.
                    // We assume values < 500 (arbitrary threshold but safe for major stocks) are in thousands. 
                    let rawPrice = data.current_price || data.price || data.close || 0;
                    if (rawPrice > 0 && rawPrice < 500) rawPrice *= 1000;

                    currentPriceValue = rawPrice;
                    setFinancials({
                        eps: data.eps_ttm || data.eps,
                        pe: data.pe_ratio || data.pe || data.PE,
                        pb: data.pb_ratio || data.pb || data.PB,
                        roe: data.roe || data.ROE,
                        roa: data.roa || data.ROA,
                        marketCap: data.market_cap || data.marketCap,
                        bookValue: data.bvps || data.bookValue,
                        dividend: data.dividend_per_share || data.dividend,
                        sharesOutstanding: data.shares_outstanding || data.sharesOutstanding,
                        netProfitMargin: data.net_profit_margin || data.netProfitMargin,
                        profitGrowth: data.profit_growth || data.profitGrowth,
                        debtToEquity: data.debt_to_equity || data.debtToEquity || data.de,
                    });
                    setRawOverviewData(data);

                    // Update description from DB if available (faster than fallback fetch)
                    if (data.overview?.description) {
                        setStockInfo(prev => ({
                            ...prev!,
                            overview: { description: data.overview.description }
                        }));
                    }

                    // Set initial Price Data from DB to show header immediately
                    setPriceData({
                        price: currentPriceValue,
                        change: (data.price_change || data.change || 0) * (data.current_price < 500 ? 1000 : 1),
                        changePercent: data.price_change_percent || data.changePercent || data.pctChange || 0,
                        open: 0,
                        high: 0,
                        low: 0,
                        volume: 0,
                        value: 0,
                        ceiling: 0,
                        floor: 0,
                        ref: 0,
                    });
                }

                // Render Header immediately with DB data
                setIsLoading(false);

                // PHASE 2: Background fetch for real-time price (slow API, don't block)
                fetch(`/api/current-price/${symbol}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(priceRes => {
                        if (priceRes && priceRes.success) {
                            const data = priceRes.data || priceRes;

                            // Normalize Real-time Price Data
                            const normalize = (val: number) => (val > 0 && val < 500) ? val * 1000 : val;
                            const newPrice = normalize(data.current_price || data.price || 0);

                            // Only update price if we got a valid realtime price
                            // Preserve history-based open/high/low/change if API doesn't provide them
                            if (newPrice > 0) {
                                setPriceData(prev => ({
                                    ...prev!,
                                    price: newPrice,
                                    // Only overwrite these if API provides them (non-zero)
                                    ...(data.open > 0 && { open: normalize(data.open) }),
                                    ...(data.high > 0 && { high: normalize(data.high) }),
                                    ...(data.low > 0 && { low: normalize(data.low) }),
                                    ...(data.volume > 0 && { volume: data.volume }),
                                    ceiling: normalize(data.ceiling || data.priceHigh || 0),
                                    floor: normalize(data.floor || data.priceLow || 0),
                                    ref: normalize(data.ref_price || data.ref || 0),
                                }));
                            }
                        }
                    })
                    .catch(() => { }); // Silently fail, we already have history data

                // PHASE 3: Parallel Fetching of other data (News, Valuation, Charts)
                Promise.allSettled([
                    fetch(`/api/news/${symbol}`).then(r => r.json()), // News
                    // Pre-fetch Valuation
                    fetch(`/api/valuation/${symbol}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ currentPrice: currentPriceValue })
                    }).then(r => r.json()),
                    // Pre-fetch Financial Charts Default (Quarter)
                    fetch(`/api/historical-chart-data/${symbol}?period=quarter`).then(r => r.json()),
                    // Pre-fetch Peers
                    fetchStockPeers(symbol as string)
                ]).then(([newsRes, valRes, chartRes, peerRes]) => {

                    // 1. News
                    if (newsRes.status === 'fulfilled' && newsRes.value) {
                        const newsData = newsRes.value.Data || newsRes.value.data || newsRes.value || [];
                        if (Array.isArray(newsData)) {
                            const mappedNews = newsData.map((item: any) => ({
                                Title: item.Title || item.title,
                                Link: item.Link || item.url || item.NewsUrl,
                                NewsUrl: item.NewsUrl || item.url,
                                PublishDate: item.PublishDate || item.publish_date || item.PostDate
                            }));
                            setNews(mappedNews.slice(0, 5));
                        }
                    }

                    // 2. Valuation
                    if (valRes.status === 'fulfilled' && valRes.value && valRes.value.success) {
                        setPrefetchedValuation(valRes.value);
                    }

                    // 3. Financial Charts
                    if (chartRes.status === 'fulfilled' && chartRes.value && chartRes.value.success) {
                        setPrefetchedChartData(chartRes.value.data);
                    }

                    // 4. Peers
                    if (peerRes.status === 'fulfilled' && Array.isArray(peerRes.value)) {
                        setPrefetchedPeers({ data: peerRes.value });
                    }
                });

            } catch (err) {
                console.error('Error loading static data:', err);
                setError('Failed to load stock data');
                setIsLoading(false);
            }
        }

        loadData();
    }, [symbol]);

    // State to hold full 5-year history for client-side filtering
    const [fullHistoryData, setFullHistoryData] = useState<HistoricalData[]>([]);

    // 1. Fetch FULL PRICE History Once (Independent)
    useEffect(() => {
        if (!symbol) return;

        async function loadFullHistory() {
            setIsChartLoading(true);
            try {
                // Fetch ALL history (defaults to 5 years/ALL in backend)
                const res = await fetch(`/api/stock/history/${symbol}?period=ALL`);
                if (res.ok) {
                    const json = await res.json();
                    const rawData = json.data || json.Data || json || [];
                    if (Array.isArray(rawData)) {
                        const normalize = (val: number) => (val > 0 && val < 500) ? val * 1000 : val;

                        const mapped = rawData.map((d: any) => ({
                            time: d.time || d.date,
                            open: normalize(d.open),
                            high: normalize(d.high),
                            low: normalize(d.low),
                            close: normalize(d.close),
                            volume: d.volume,
                        }));
                        // Sort by date ascending to ensure proper charting
                        mapped.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
                        setFullHistoryData(mapped);

                        // Update priceData with latest session info (high, low, open, change)
                        if (mapped.length > 0) {
                            const latest = mapped[mapped.length - 1];
                            const prevClose = mapped.length > 1 ? mapped[mapped.length - 2].close : latest.open;
                            const change = latest.close - prevClose;
                            const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

                            setPriceData(prev => ({
                                ...prev!,
                                price: latest.close,
                                open: latest.open,
                                high: latest.high,
                                low: latest.low,
                                volume: latest.volume,
                                change: change,
                                changePercent: changePercent,
                            }));
                        }
                    }
                }
            } catch (e) {
                console.error("Fetch full history failed", e);
            } finally {
                setIsChartLoading(false);
            }
        }
        loadFullHistory();
    }, [symbol]);

    // 2. Client-side Filter when timeRange changes (Instant Transition)
    useEffect(() => {
        if (fullHistoryData.length === 0) return;

        const now = new Date();
        let cutoff = new Date();

        switch (timeRange) {
            case '3M': cutoff.setDate(now.getDate() - 90); break;
            case '6M': cutoff.setDate(now.getDate() - 180); break;
            case '1Y': cutoff.setDate(now.getDate() - 365); break;
            case '3Y': cutoff.setDate(now.getDate() - 365 * 3); break;
            case '5Y': cutoff.setDate(now.getDate() - 365 * 5); break;
            default: cutoff.setDate(now.getDate() - 90); // Default 3M
        }

        const filtered = fullHistoryData.filter(d => new Date(d.time) >= cutoff);
        setHistoricalData(filtered);
    }, [timeRange, fullHistoryData]);

    // No longer need separate effect specifically for fetching reports if we trust components to handle it
    // BUT FinancialsTab component logic accepts `initialOverviewData`.
    // The separate table logic inside `page.tsx` for `activeSubTab` (lines 309-358 in old file) seems to be NOT USED by `FinancialsTab` anymore?
    // Let's check `FinancialsTab` content again. It displays charts and metrics cards. It does NOT display a raw table of reports with props `financialReport` or `ratioData`.
    // The old `page.tsx` had logic to fetch tables, but `FinancialsTab` (which I just updated) doesn't seem to take `financialReport` prop.
    // It takes `initialChartData` and `initialOverviewData`.
    // It seems the "FinancialsTab" component REPLACED the old Table logic. 
    // Wait, the old `page.tsx` had `activeSubTab` state. `FinancialsTab.tsx` doesn't seem to use it.
    // Checking `FinancialsTab.tsx`: It renders MetricCards and Charts. It does NOT have tabs for "Ratio/Income/Balance".
    // It has Period toggle (Quarter/Year).
    // So the state `activeSubTab` in `page.tsx` is actually UNUSED if `FinancialsTab` controls its own view.
    // I will remove the unused `activeSubTab` logic and state to clean up.

    const isUp = priceData ? priceData.change >= 0 : true;

    // Watchlist Logic
    const [isWatchlisted, setIsWatchlisted] = useState(false);
    useEffect(() => {
        if (!symbol) return;
        const saved = JSON.parse(localStorage.getItem('watchlist') || '[]');
        setIsWatchlisted(saved.includes(symbol));
    }, [symbol]);

    const toggleWatchlist = () => {
        const saved = JSON.parse(localStorage.getItem('watchlist') || '[]');
        let newSaved;
        if (isWatchlisted) {
            newSaved = saved.filter((s: string) => s !== symbol);
        } else {
            newSaved = [...saved, symbol];
        }
        localStorage.setItem('watchlist', JSON.stringify(newSaved));
        setIsWatchlisted(!isWatchlisted);
    };

    // Polling Price every 5 seconds
    useEffect(() => {
        if (!symbol) return;

        const interval = setInterval(() => {
            fetch(`/api/current-price/${symbol}`)
                .then(r => r.ok ? r.json() : null)
                .then(priceRes => {
                    if (priceRes && priceRes.success) {
                        const data = priceRes.data || priceRes;
                        const normalize = (val: number) => (val > 0 && val < 500) ? val * 1000 : val;
                        const newPrice = normalize(data.current_price || data.price || 0);

                        if (newPrice > 0) {
                            setPriceData(prev => {
                                if (!prev) return null;
                                // Recalculate change based on reference price
                                // Use new ref price if available, otherwise keep existing
                                const refPrice = data.ref_price ? normalize(data.ref_price) : (data.ref ? normalize(data.ref) : prev.ref);

                                // Calculate change
                                let change = 0;
                                let changePercent = 0;

                                if (refPrice > 0) {
                                    change = newPrice - refPrice;
                                    changePercent = (change / refPrice) * 100;
                                } else {
                                    // Fallback if no ref price (rare): use change from API
                                    change = normalize(data.change || data.price_change || 0);
                                    changePercent = data.changePercent || data.price_change_percent || 0;
                                }

                                return {
                                    ...prev,
                                    price: newPrice,
                                    ref: refPrice > 0 ? refPrice : prev.ref,
                                    change: change,
                                    changePercent: changePercent,
                                    // Update other fields if available
                                    ...(data.open > 0 && { open: normalize(data.open) }),
                                    ...(data.high > 0 && { high: normalize(data.high) }),
                                    ...(data.low > 0 && { low: normalize(data.low) }),
                                    ...(data.volume > 0 && { volume: data.volume }),
                                    ...(data.ceiling > 0 && { ceiling: normalize(data.ceiling) }),
                                    ...(data.floor > 0 && { floor: normalize(data.floor) }),
                                };
                            });
                        }
                    }
                })
                .catch(err => console.error("Polling error", err));
        }, 30000);

        return () => clearInterval(interval);
    }, [symbol]);

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className="spinner" />
                    <span>Đang tải dữ liệu {symbol}...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <span>⚠️ {error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header Compact */}
            <div className={styles.stockHeaderCompact}>
                <div className={styles.identityCompact}>
                    <div className={styles.logoWrapper} style={{ width: '42px', height: '42px' }}>
                        <img
                            src={`/logos/${symbol}.jpg`}
                            alt={symbol}
                            className={styles.logoCompact}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className={styles.fallbackLogo} style={{ width: '42px', height: '42px', fontSize: '1rem' }}>{symbol.slice(0, 2)}</div>
                    </div>

                    <div className={styles.stockMetaCompact}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 className="text-tremor-content-strong dark:text-dark-tremor-content-strong" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{symbol}</h1>
                        </div>
                        <div className="text-tremor-content dark:text-dark-tremor-content" style={{ fontSize: '0.85rem', lineHeight: '1.4', marginTop: '2px' }}>
                            {stockInfo?.companyName}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <span className={styles.tag} style={{ fontSize: '10px', padding: '2px 6px' }}>{stockInfo?.exchange}</span>
                            <span className={styles.tag} style={{ fontSize: '10px', padding: '2px 6px' }}>{stockInfo?.sector}</span>
                        </div>
                    </div>
                </div>

                {priceData && (
                    <div className={styles.priceCompact}>
                        <div className={styles.priceRowCompact}>
                            <span className="text-tremor-content-strong dark:text-dark-tremor-content-strong" style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>
                                {formatNumber(priceData.price)}
                            </span>
                            <span className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle" style={{ fontSize: '0.75rem', fontWeight: 500 }}>VND</span>
                            <span style={{ fontSize: '1rem', fontWeight: 600, color: priceData.change >= 0 ? '#10b981' : '#ef4444' }}>
                                {priceData.change > 0 ? '+' : ''}{formatNumber(priceData.change)} <span style={{ opacity: 0.7 }}>({formatPercentChange(priceData.changePercent)})</span>
                            </span>
                        </div>
                        <div className={styles.klcpCompact}>
                            KLCP: {financials?.sharesOutstanding ? formatNumber(financials.sharesOutstanding) : '-'}
                        </div>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-tremor-border dark:border-dark-tremor-border">
                <div className="px-2 sm:px-4">
                    <div className="flex h-14 overflow-x-auto scrollbar-hide">
                        <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
                            {[
                                { id: 'overview', label: 'Overview' },
                                { id: 'financials', label: 'Financials' },
                                { id: 'priceHistory', label: 'Price History' },
                                { id: 'analysis', label: 'Analysis' },
                                { id: 'valuation', label: 'Valuation' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={classNames(
                                        activeTab === tab.id
                                            ? 'border-tremor-brand text-tremor-brand dark:border-dark-tremor-brand dark:text-dark-tremor-brand'
                                            : 'border-transparent text-tremor-content-emphasis hover:border-tremor-content-subtle hover:text-tremor-content-strong dark:text-dark-tremor-content-emphasis hover:dark:border-dark-tremor-content-subtle hover:dark:text-dark-tremor-content-strong',
                                        'inline-flex items-center whitespace-nowrap border-b-2 px-2 text-tremor-default font-medium'
                                    )}
                                    aria-current={activeTab === tab.id ? 'page' : undefined}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>
            </div>



            {/* Main Content */}
            <div className={activeTab === 'overview' ? styles.mainContent : styles.mainContentFull}>
                {activeTab === 'overview' && (
                    <OverviewTab
                        symbol={symbol}
                        stockInfo={stockInfo}
                        priceData={priceData}
                        financials={financials}
                        news={news}
                        timeRange={timeRange}
                        setTimeRange={setTimeRange}
                        isDescExpanded={isDescExpanded}
                        setIsDescExpanded={setIsDescExpanded}
                        historicalData={historicalData}
                        isLoading={isChartLoading}
                    />
                )}

                {
                    activeTab === 'financials' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <h3 className="text-tremor-title font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong whitespace-nowrap">
                                    Financials
                                </h3>
                                <div className="flex items-center gap-2">
                                    <Select
                                        className="w-[80px] sm:w-fit [&>button]:rounded-tremor-small"
                                        enableClear={false}
                                        value={financialPeriod}
                                        onValueChange={(value) => setFinancialPeriod(value as 'quarter' | 'year')}
                                    >
                                        <SelectItem value="quarter">Quarter</SelectItem>
                                        <SelectItem value="year">Year</SelectItem>
                                    </Select>
                                    <button
                                        type="button"
                                        onClick={handleDownloadExcel}
                                        className="inline-flex items-center justify-center gap-2 rounded-tremor-small border border-tremor-border bg-white px-3 py-2 text-tremor-default font-medium text-tremor-content-strong shadow-sm hover:bg-tremor-background-muted dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-strong"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        <span className="hidden sm:inline">Export Excel</span>
                                        <span className="sm:hidden">Excel</span>
                                    </button>
                                </div>
                            </div>
                            <FinancialsTab
                                symbol={symbol}
                                period={financialPeriod}
                                setPeriod={setFinancialPeriod}
                                initialChartData={prefetchedChartData}
                                initialOverviewData={rawOverviewData}
                            />
                        </div>
                    )
                }

                {
                    activeTab === 'priceHistory' && (
                        <PriceHistoryTab
                            symbol={symbol}
                            initialData={fullHistoryData.length > 0 ? fullHistoryData : undefined}
                        />
                    )
                }

                {
                    activeTab === 'valuation' && (
                        <ValuationTab
                            symbol={symbol}
                            currentPrice={priceData?.price || 0}
                            initialData={prefetchedValuation}
                            isBank={stockInfo?.sector === 'Ngân hàng' || ['VCB', 'BID', 'CTG', 'VPB', 'MBB', 'TCB', 'ACB', 'HDB', 'VIB', 'STB', 'TPB', 'MSB', 'LPB', 'SHB', 'OCB', 'VBB', 'BAB', 'BVB', 'EIB', 'KLB', 'SGB', 'PGB', 'NVB', 'VAB'].includes(symbol)}
                        />
                    )
                }
                {
                    activeTab === 'analysis' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <h3 className="text-tremor-title font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong whitespace-nowrap">
                                    Analysis
                                </h3>
                            </div>
                            <AnalysisTab
                                symbol={symbol}
                                sector={stockInfo?.sector || 'Unknown'}
                                initialPeers={prefetchedPeers}
                                initialHistory={prefetchedChartData}
                            />
                        </div>
                    )
                }
            </div >
        </div >
    );
}
