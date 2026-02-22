'use client';

import { useState, useEffect, useCallback } from 'react';
import IndexCard from '@/components/IndexCard';
import PEChart from '@/components/PEChart';
import NewsSection from '@/components/NewsSection';

import { GoldPrice, Lottery, MarketPulse } from '@/components/Sidebar';
import {
    fetchAllIndices,
    fetchNews,
    fetchTopMovers,
    fetchForeignFlow,
    fetchGoldPrices,
    formatRelativeTime,
    INDEX_MAP,
    MarketIndexData,
    NewsItem,
    TopMoverItem,
    GoldPriceItem,
    PEChartData
} from '@/lib/api';
import styles from './page.module.css';

interface IndexData {
    id: string;
    name: string;
    value: number;
    change: number;
    percentChange: number;
    chartData: number[];
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
            const marketData = await fetchAllIndices();

            const indexDataPromises = Object.entries(INDEX_MAP).map(async ([indexId, info]) => {
                const data = marketData[indexId] as MarketIndexData | undefined;
                if (!data) return null;

                const currentIndex = data.CurrentIndex;
                const prevIndex = data.PrevIndex;
                const change = currentIndex - prevIndex;
                const percent = prevIndex > 0 ? (change / prevIndex) * 100 : 0;

                const chartData: number[] = [];

                return {
                    id: info.id,
                    name: info.name,
                    value: currentIndex,
                    change,
                    percentChange: percent,
                    chartData,
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

    // Auto refresh indices every 15 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadIndices();
        }, 10000);
        return () => clearInterval(interval);
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
                    📅 Updated at: {formatRelativeTime(lastUpdate, 'vi-VN')}
                </div>
            )}

            <div className={styles.mainContent}>
                {/* Left Column - Main Content */}
                <div className={styles.leftColumn}>
                    {/* Indices Grid - 2x2 layout, no title */}
                    <div className={styles.indicesGrid}>
                        {indicesLoading ? (
                            // Loading skeletons
                            Array.from({ length: 4 }).map((_, i) => (
                                <IndexCard
                                    key={i}
                                    id={`skeleton-${i}`}
                                    name=""
                                    value={0}
                                    change={0}
                                    percentChange={0}
                                    isLoading={true}
                                />
                            ))
                        ) : (
                            indices.map((index) => (
                                <IndexCard
                                    key={index.id}
                                    id={index.id}
                                    name={index.name}
                                    value={index.value}
                                    change={index.change}
                                    percentChange={index.percentChange}
                                    chartData={index.chartData}
                                />
                            ))
                        )}
                    </div>



                    {/* P/E Chart */}
                    <PEChart initialData={initialPEData} />

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
