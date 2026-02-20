'use client';

import { useState, useEffect, useCallback } from 'react';
import IndexCard from '@/components/IndexCard';
import PEChart from '@/components/PEChart';
import NewsSection from '@/components/NewsSection';
import Standouts from '@/components/Standouts/Standouts';

import { GoldPrice, Lottery, MarketPulse } from '@/components/Sidebar';
import {
    fetchNews,
    fetchTopMovers,
    fetchForeignFlow,
    fetchGoldPrices,
    fetchVciIndices,
    fetchStandouts,
    INDEX_MAP,
    MarketIndexData,
    NewsItem,
    TopMoverItem,
    GoldPriceItem,
    PEChartData,
    VciIndexData
} from '@/lib/api';
import styles from './page.module.css';

// Static placeholders — ensures 4 card slots are reserved before data arrives (prevents CLS)
const PLACEHOLDER_INDICES: { id: string; name: string }[] = Object.entries(INDEX_MAP).map(([, info]) => ({
    id: info.id,
    name: info.name,
}));

interface IndexData {
    id: string;
    name: string;
    value: number;
    change: number;
    percentChange: number;
    chartData: number[];
    advances: number;
    declines: number;
    noChanges: number;
    ceilings: number;
    floors: number;
    totalShares: number;
    totalValue: number;
}

interface OverviewClientProps {
    initialIndices: IndexData[];
    initialNews: NewsItem[];
    initialGainers: TopMoverItem[];
    initialLosers: TopMoverItem[];
    initialForeignBuys: TopMoverItem[];
    initialForeignSells: TopMoverItem[];
    initialGoldPrices: GoldPriceItem[];
    initialGoldUpdated?: string;
    initialPEData: PEChartData[];
}

export default function OverviewClient({
    initialIndices,
    initialNews,
    initialGainers,
    initialLosers,
    initialForeignBuys,
    initialForeignSells,
    initialGoldPrices,
    initialGoldUpdated,
    initialPEData
}: OverviewClientProps) {

    // State for indices
    const [indices, setIndices] = useState<IndexData[]>(initialIndices);
    // Indices are pre-loaded so not loading initially
    const [indicesLoading, setIndicesLoading] = useState(false);

    // State for news
    const [news, setNews] = useState<NewsItem[]>(initialNews);
    const [newsLoading, setNewsLoading] = useState(initialNews.length === 0);
    const [newsError, setNewsError] = useState<string | null>(null);

    // State for top movers
    const [gainers, setGainers] = useState<TopMoverItem[]>(initialGainers);
    const [losers, setLosers] = useState<TopMoverItem[]>(initialLosers);
    const [moversTab, setMoversTab] = useState<'UP' | 'DOWN'>('UP');
    const [moversLoading, setMoversLoading] = useState(initialGainers.length === 0 || initialLosers.length === 0);

    // State for foreign flow
    const [foreignBuys, setForeignBuys] = useState<TopMoverItem[]>(initialForeignBuys);
    const [foreignSells, setForeignSells] = useState<TopMoverItem[]>(initialForeignSells);
    const [foreignTab, setForeignTab] = useState<'buy' | 'sell'>('buy');
    const [foreignLoading, setForeignLoading] = useState(initialForeignBuys.length === 0 || initialForeignSells.length === 0);

    // State for gold prices
    const [goldPrices, setGoldPrices] = useState<GoldPriceItem[]>(initialGoldPrices);
    const [goldLoading, setGoldLoading] = useState(false);
    const [goldUpdatedAt, setGoldUpdatedAt] = useState<string>(initialGoldUpdated || new Date().toISOString());

    // Standouts
    const [standouts, setStandouts] = useState<any[]>([]);
    const [standoutsLoading, setStandoutsLoading] = useState(true);

    // Last update time - only render on client to avoid hydration mismatch
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    // Set initial time on client mount
    useEffect(() => {
        // eslint-disable-next-line
        setLastUpdate(new Date());
        setIsMounted(true);
    }, []);

    // Load indices data (Client-side Refresh)
    const loadIndices = useCallback(async () => {
        try {
            // Don't set loading to true for background refresh to avoid flickering
            const vciDataArray = await fetchVciIndices();

            const indexDataPromises = Object.entries(INDEX_MAP).map(async ([indexId, info]) => {
                const vciData = vciDataArray.find((item: VciIndexData) => item.symbol === info.vciSymbol);
                if (!vciData) return null;

                const currentIndex = vciData.price;
                const prevIndex = vciData.refPrice;
                const change = vciData.change;
                const percent = vciData.changePercent;

                const advances = vciData.totalStockIncrease;
                const declines = vciData.totalStockDecline;
                const noChanges = vciData.totalStockNoChange;
                const ceilings = vciData.totalStockCeiling;
                const floors = vciData.totalStockFloor;

                const totalShares = vciData.totalShares;
                const totalValue = vciData.totalValue;

                return {
                    id: info.id,
                    name: info.name,
                    value: currentIndex,
                    change,
                    percentChange: percent,
                    chartData: [] as number[],
                    advances,
                    declines,
                    noChanges,
                    ceilings,
                    floors,
                    totalShares,
                    totalValue,
                };
            });

            const results = await Promise.all(indexDataPromises);
            setIndices(results.filter((r): r is IndexData => r !== null));
            setLastUpdate(new Date());
        } catch (error) {
            console.error('Error loading indices:', error);
        }
    }, []);

    // Load gold prices (Client-side Refresh)
    const loadGold = useCallback(async () => {
        try {
            const result = await fetchGoldPrices();
            setGoldPrices(result.data);
            if (result.updated_at) {
                setGoldUpdatedAt(result.updated_at);
            }
        } catch (error) {
            console.error('Error loading gold prices:', error);
        }
    }, []);

    const loadNews = useCallback(async () => {
        try {
            setNewsLoading(true);
            setNewsError(null);
            const items = await fetchNews(1, 30);
            setNews(items);
        } catch (error) {
            console.error('Error loading news:', error);
            setNewsError('Unable to load market news');
        } finally {
            setNewsLoading(false);
        }
    }, []);

    const loadMovers = useCallback(async () => {
        try {
            setMoversLoading(true);
            const [up, down] = await Promise.all([
                fetchTopMovers('UP'),
                fetchTopMovers('DOWN'),
            ]);
            setGainers(up);
            setLosers(down);
        } catch (error) {
            console.error('Error loading top movers:', error);
        } finally {
            setMoversLoading(false);
        }
    }, []);

    const loadForeign = useCallback(async () => {
        try {
            setForeignLoading(true);
            const [buy, sell] = await Promise.all([
                fetchForeignFlow('buy'),
                fetchForeignFlow('sell'),
            ]);
            setForeignBuys(buy);
            setForeignSells(sell);
        } catch (error) {
            console.error('Error loading foreign flow:', error);
        } finally {
            setForeignLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initialGoldPrices || initialGoldPrices.length === 0) {
            loadGold();
        }
    }, [initialGoldPrices, loadGold]);

    useEffect(() => {
        if (!initialNews || initialNews.length === 0) {
            loadNews();
        }
    }, [initialNews, loadNews]);

    useEffect(() => {
        if (!initialGainers || !initialLosers || initialGainers.length === 0 || initialLosers.length === 0) {
            loadMovers();
        }
    }, [initialGainers, initialLosers, loadMovers]);

    useEffect(() => {
        if (!initialForeignBuys || !initialForeignSells || initialForeignBuys.length === 0 || initialForeignSells.length === 0) {
            loadForeign();
        }
    }, [initialForeignBuys, initialForeignSells, loadForeign]);

    // Load Standouts on mount
    useEffect(() => {
        fetchStandouts().then(data => {
            setStandouts(data);
            setStandoutsLoading(false);
        }).catch(() => setStandoutsLoading(false));
    }, []);

    // Auto refresh indices every 1s - using recursive setTimeout (not setInterval)
    // so we never queue a second request while one is still in-flight
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        let active = true;

        const schedule = () => {
            timer = setTimeout(async () => {
                if (!active) return;
                await loadIndices();
                if (active) schedule();
            }, 3000);
        };

        schedule();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [loadIndices]);

    // Auto refresh gold every 60 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadGold();
        }, 60000);
        return () => clearInterval(interval);
    }, [loadGold]);

    return (
        <div className={styles.container}>
            {/* Last update time - only show on client */}
            {isMounted && lastUpdate && (
                <div className={styles.updateTime}>
                    📅 Updated at: {lastUpdate.toLocaleString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                    })}
                </div>
            )}

            <div className={styles.mainContent}>
                {/* Left Column - Main Content */}
                <div className={styles.leftColumn}>
                    {/* Indices Grid - 2x2 layout, no title */}
                    <div className={styles.indicesGrid}>
                        {/* Always render 4 cards — skeleton shows immediately, data fills in */}
                        {PLACEHOLDER_INDICES.map((placeholder) => {
                            const data = indices.find(d => d.id === placeholder.id);
                            const hasData = !!data;
                            return (
                                <IndexCard
                                    key={placeholder.id}
                                    id={placeholder.id}
                                    name={placeholder.name}
                                    value={data?.value ?? 0}
                                    change={data?.change ?? 0}
                                    percentChange={data?.percentChange ?? 0}
                                    chartData={data?.chartData ?? []}
                                    advances={data?.advances ?? 0}
                                    declines={data?.declines ?? 0}
                                    noChanges={data?.noChanges ?? 0}
                                    ceilings={data?.ceilings ?? 0}
                                    floors={data?.floors ?? 0}
                                    totalShares={data?.totalShares ?? 0}
                                    totalValue={data?.totalValue ?? 0}
                                    isLoading={!hasData}
                                />
                            );
                        })}
                    </div>



                    {/* P/E Chart */}
                    <PEChart initialData={initialPEData} />

                    {/* Standouts */}
                    <Standouts data={standouts} isLoading={standoutsLoading} />

                    {/* News Section */}
                    <NewsSection
                        news={news}
                        isLoading={newsLoading}
                        error={newsError}
                    />
                </div>

                {/* Right Column - Sidebar */}
                <aside className={styles.rightColumn}>
                    {/* Market Pulse (Combined Top Movers & Foreign Flow) */}
                    <MarketPulse
                        gainers={gainers}
                        losers={losers}
                        foreignBuys={foreignBuys}
                        foreignSells={foreignSells}
                        isLoading={moversLoading || foreignLoading}
                    />

                    {/* Gold Prices */}
                    <GoldPrice
                        prices={goldPrices}
                        isLoading={goldLoading}
                        updatedAt={goldUpdatedAt}
                    />

                    {/* Lottery Results */}
                    <Lottery />
                </aside>
            </div>
        </div>
    );
}
