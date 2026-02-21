import React, { useMemo } from 'react';
import { formatNumber, formatDate, formatPercentChange } from '@/lib/api';
import styles from '../../app/stock/[symbol]/page.module.css';
import { BarChart, Card, LineChart } from '@tremor/react';

function classNames(...classes: Array<string | false | undefined | null>) {
    return classes.filter(Boolean).join(' ');
}

function formatDateRange(days: number) {
    return ''; // Return empty initially, tooltips are secondary
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

interface NewsItem {
    Title?: string;
    Link?: string;
    NewsUrl?: string;
    PostDate?: string;
    PublishDate?: string;

    title?: string;
    url?: string;
    source?: string;
    publish_date?: string;
    image_url?: string;
    sentiment?: string;
    score?: number;
    female_audio_duration?: number;
    male_audio_duration?: number;
}

interface HistoricalData {
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface OverviewTabProps {
    symbol: string;
    stockInfo: StockInfo | null;
    priceData: PriceData | null;
    financials: FinancialData | null;
    news: NewsItem[];
    historicalData: HistoricalData[];
    timeRange: '3M' | '6M' | '1Y' | '3Y' | '5Y';         // visual: button active state (instant)
    deferredTimeRange?: '3M' | '6M' | '1Y' | '3Y' | '5Y'; // chart: data filter (deferred)
    setTimeRange: (range: '3M' | '6M' | '1Y' | '3Y' | '5Y') => void;
    isDescExpanded: boolean;
    setIsDescExpanded: (v: boolean) => void;
    isLoading: boolean;
}

function OverviewTab({
    symbol,
    stockInfo,
    priceData,
    financials,
    news,
    historicalData,
    timeRange,
    deferredTimeRange,
    setTimeRange,
    isDescExpanded,
    setIsDescExpanded,
    isLoading
}: OverviewTabProps) {
    const isUp = priceData ? priceData.change >= 0 : true;
    const priceColor = isUp ? styles.positive : styles.negative;
    // Use deferredTimeRange for heavy chart filter (deferred), fallback to timeRange
    const activeRange = deferredTimeRange ?? timeRange;

    // Prepare chart data for Tremor
    const chartData = useMemo(() => {
        if (!historicalData || historicalData.length === 0) return [];

        return historicalData.map((d, i) => {
            const date = new Date(String(d.time).replace(' ', 'T'));
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear().toString().slice(-2);

            // Determine volume color based on price change
            const prevClose = i > 0 ? historicalData[i - 1].close : d.open;
            const isUp = d.close >= prevClose;

            return {
                date: `${month}/${year}`,
                Price: d.close,
                Volume: d.volume,
                volumeColor: isUp ? '#10b981' : '#ef4444',
            };
        });
    }, [historicalData]);

    const valueFormatter = (number: number) =>
        `${Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)}`;

    const filterButtons = [
        { key: '3M' as const, label: '3M', tooltip: formatDateRange(90) },
        { key: '6M' as const, label: '6M', tooltip: formatDateRange(180) },
        { key: '1Y' as const, label: '1Y', tooltip: formatDateRange(365) },
        { key: '3Y' as const, label: '3Y', tooltip: formatDateRange(1095) },
        { key: '5Y' as const, label: '5Y', tooltip: formatDateRange(1825) },
    ];


    const stats52w = useMemo(() => {
        if (!historicalData || historicalData.length === 0) {
            return {
                high52w: null as number | null,
                low52w: null as number | null,
                avgVol52w: null as number | null,
            };
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 365);

        const last52w = historicalData.filter((d) => new Date(String(d.time).replace(' ', 'T')).getTime() >= cutoff.getTime());
        if (last52w.length === 0) {
            return {
                high52w: null as number | null,
                low52w: null as number | null,
                avgVol52w: null as number | null,
            };
        }

        const highs = last52w.map((d) => d.high).filter((v) => !Number.isNaN(v));
        const lows = last52w.map((d) => d.low).filter((v) => !Number.isNaN(v));
        const vols = last52w.map((d) => d.volume).filter((v) => !Number.isNaN(v));

        const high52w = highs.length ? Math.max(...highs) : null;
        const low52w = lows.length ? Math.min(...lows) : null;
        const avgVol52w = vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : null;

        return { high52w, low52w, avgVol52w };
    }, [historicalData]);

    // Get today's stats from the latest entry in historicalData (more reliable than API)
    const todayStats = useMemo(() => {
        if (!historicalData || historicalData.length === 0) {
            return {
                open: priceData?.open || 0,
                high: priceData?.high || 0,
                low: priceData?.low || 0,
            };
        }
        const latest = historicalData[historicalData.length - 1];
        return {
            open: latest.open || priceData?.open || 0,
            high: latest.high || priceData?.high || 0,
            low: latest.low || priceData?.low || 0,
        };
    }, [historicalData, priceData]);

    const priceRange = useMemo(() => {
        const prices = chartData.map((d) => Number(d.Price)).filter((v) => !Number.isNaN(v));
        if (prices.length === 0) return { min: 0, max: 0 };
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const padding = (max - min) * 0.05;
        const rawMin = min - padding;
        const rawMax = max + padding;
        const step = 1000;
        return {
            min: Math.floor(rawMin / step) * step,
            max: Math.ceil(rawMax / step) * step,
        };
    }, [chartData]);

    return (
        <>
            {/* Left Column */}
            <div className={styles.leftColumn}>
                {/* Price Chart */}
                <section className={`${styles.section} ${styles.sectionChart} mt-2 sm:mt-0`}>
                    <div className={styles.sectionHeader}>
                        <div className="hidden items-center rounded-tremor-small text-tremor-default font-medium shadow-tremor-input dark:shadow-dark-tremor-input sm:inline-flex">
                            {filterButtons.map((item, index) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    title={item.tooltip}
                                    onClick={() => setTimeRange(item.key)}
                                    className={classNames(
                                        index === 0 ? 'rounded-l-tremor-small' : '-ml-px',
                                        index === filterButtons.length - 1 ? 'rounded-r-tremor-small' : '',
                                        'border border-tremor-border bg-tremor-background px-4 py-2 text-tremor-content-strong hover:bg-tremor-background-muted hover:text-tremor-content-strong focus:z-10 focus:outline-none dark:border-dark-tremor-border dark:bg-gray-950 dark:text-dark-tremor-content-strong hover:dark:bg-gray-950/50',
                                        timeRange === item.key && 'bg-tremor-brand-muted text-tremor-brand dark:bg-dark-tremor-brand-muted dark:text-dark-tremor-brand'
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        {/* Mobile Filter Buttons */}
                        <div className="flex w-full items-center justify-between rounded-tremor-small text-tremor-default font-medium shadow-tremor-input dark:shadow-dark-tremor-input sm:hidden mt-2">
                            {filterButtons.map((item, index) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    title={item.tooltip}
                                    onClick={() => setTimeRange(item.key)}
                                    className={classNames(
                                        index === 0 ? 'rounded-l-tremor-small' : '-ml-px',
                                        index === filterButtons.length - 1 ? 'rounded-r-tremor-small' : '',
                                        'flex-1 border border-tremor-border bg-tremor-background py-2 text-center text-tremor-content-strong hover:bg-tremor-background-muted hover:text-tremor-content-strong focus:z-10 focus:outline-none dark:border-dark-tremor-border dark:bg-gray-950 dark:text-dark-tremor-content-strong hover:dark:bg-gray-950/50',
                                        timeRange === item.key && 'bg-tremor-brand-muted text-tremor-brand dark:bg-dark-tremor-brand-muted dark:text-dark-tremor-brand'
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-6">
                        <div className="">
                            {isLoading && (
                                <div className="flex h-80 items-center justify-center">
                                    <div className="spinner" />
                                </div>
                            )}
                            {!isLoading && chartData.length > 0 && (
                                <>
                                    <LineChart
                                        data={chartData}
                                        index="date"
                                        categories={["Price"]}
                                        colors={["blue"]}
                                        valueFormatter={valueFormatter}
                                        yAxisWidth={70}
                                        showLegend={false}
                                        minValue={priceRange.min}
                                        maxValue={priceRange.max}
                                        showXAxis={false}
                                        showTooltip={true}
                                        className="hidden h-72 sm:block"
                                    />
                                    <LineChart
                                        data={chartData}
                                        index="date"
                                        categories={["Price"]}
                                        colors={["blue"]}
                                        valueFormatter={valueFormatter}
                                        showYAxis={false}
                                        showLegend={false}
                                        startEndOnly={false}
                                        minValue={priceRange.min}
                                        maxValue={priceRange.max}
                                        showXAxis={false}
                                        showTooltip={true}
                                        className="h-72 sm:hidden"
                                    />
                                    <div className="mt-3">
                                        <BarChart
                                            data={chartData}
                                            index="date"
                                            categories={["Volume"]}
                                            colors={["emerald"]}
                                            valueFormatter={(value) => Intl.NumberFormat('en-US').format(value)}
                                            showLegend={false}
                                            showYAxis={false}
                                            startEndOnly={false}
                                            showXAxis={true}
                                            className="h-16"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        {priceData && (
                            <div className="">
                                <div className="grid grid-cols-3 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                                    {[
                                        { name: '52W High', value: stats52w.high52w !== null ? formatNumber(stats52w.high52w, { maximumFractionDigits: 0 }) : '-', bgColor: 'bg-blue-500' },
                                        { name: '52W Low', value: stats52w.low52w !== null ? formatNumber(stats52w.low52w, { maximumFractionDigits: 0 }) : '-', bgColor: 'bg-violet-500' },
                                        { name: 'Today Open', value: todayStats.open > 0 ? formatNumber(todayStats.open, { maximumFractionDigits: 0 }) : '-', bgColor: 'bg-fuchsia-500' },
                                        { name: 'Today High', value: todayStats.high > 0 ? formatNumber(todayStats.high, { maximumFractionDigits: 0 }) : '-', bgColor: 'bg-amber-500' },
                                        { name: 'Today Low', value: todayStats.low > 0 ? formatNumber(todayStats.low, { maximumFractionDigits: 0 }) : '-', bgColor: 'bg-cyan-500' },
                                        { name: 'Avg 52W Vol', value: stats52w.avgVol52w !== null ? formatNumber(stats52w.avgVol52w) : '-', bgColor: 'bg-emerald-500' },
                                    ].map((item) => (
                                        <div key={item.name} className="flex items-center gap-3">
                                            <span className={classNames(item.bgColor, 'h-8 w-1 shrink-0 rounded')} aria-hidden={true} />
                                            <div className="min-w-0">
                                                <p className="text-tremor-default text-tremor-content dark:text-dark-tremor-content">
                                                    {item.name}
                                                </p>
                                                <p className="truncate font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                                    {item.value}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>


                {/* Related News */}
                {news.length > 0 && (
                    <section className={`${styles.section} ${styles.sectionNews}`}>
                        <h2 className="text-xl font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong mb-5">📰 Related News</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-5">
                            {news.map((item, index) => {
                                const url = item.url || item.Link || item.NewsUrl || '#';
                                const finalUrl = url.startsWith('http') ? url : `https://cafef.vn${url}`;
                                const title = item.title || item.Title || '';
                                const source = item.source || 'Cafef';
                                const pubDateStr = item.publish_date || item.PostDate || item.PublishDate;

                                const timeFormat = pubDateStr ? formatDate(pubDateStr) : '';
                                const image = item.image_url || '';

                                // Sentiment formatting
                                let sentiment = 'Trung lập';
                                let sentimentColor = 'text-yellow-600 dark:text-yellow-500';
                                if (item.sentiment === 'Positive') {
                                    sentiment = 'Tích cực';
                                    sentimentColor = 'text-emerald-600 dark:text-emerald-500';
                                } else if (item.sentiment === 'Negative') {
                                    sentiment = 'Tiêu cực';
                                    sentimentColor = 'text-rose-600 dark:text-rose-500';
                                }

                                // Audio duration
                                const audioDur = item.female_audio_duration || item.male_audio_duration || 0;
                                const mins = Math.floor(audioDur / 60);
                                const secs = Math.floor(audioDur % 60);
                                const durString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                                // Price formatting for tag
                                const priceTextColor = priceData && priceData.change > 0 ? 'text-emerald-600 dark:text-emerald-500'
                                    : priceData && priceData.change < 0 ? 'text-rose-600 dark:text-rose-500'
                                        : 'text-yellow-600 dark:text-yellow-500';

                                return (
                                    <div key={index}
                                        className="flex flex-col rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] overflow-hidden hover:ring-1 hover:ring-tremor-brand transition-all cursor-pointer shadow-sm hover:shadow-md"
                                        onClick={() => window.open(finalUrl, '_blank')}
                                    >
                                        {/* Image Header */}
                                        <div className="h-44 w-full bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle relative overflow-hidden group">
                                            {image ? (
                                                <img
                                                    src={image}
                                                    alt={title}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                    loading="lazy"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-tremor-content-subtle dark:text-dark-tremor-content-subtle bg-slate-100 dark:bg-slate-800">
                                                    <svg className="w-10 h-10 opacity-30" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 3h-15C3.12 3 2 4.12 2 5.5v13C2 19.88 3.12 21 4.5 21h15c1.38 0 2.5-1.12 2.5-2.5v-13C22 4.12 20.88 3 19.5 3zM19.5 19h-15V5.5h15V19zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                                                </div>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="p-4 flex flex-col flex-1">
                                            {/* Meta data row */}
                                            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                                                {item.sentiment && <span className={sentimentColor}>{sentiment}</span>}
                                                {item.sentiment && <span className="text-gray-400 dark:text-gray-600">•</span>}
                                                <span className="text-tremor-content-strong dark:text-dark-tremor-content-strong">{symbol}</span>
                                                {priceData && (
                                                    <div className={`flex items-center gap-1 ml-1 ${priceTextColor}`}>
                                                        <span>{formatNumber(priceData.price)}</span>
                                                        <span className={`px-1 rounded-sm text-[10px] ${priceData.change > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                                                            : priceData.change < 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30'
                                                                : 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30'
                                                            }`}>
                                                            {priceData.change > 0 ? '+' : ''}{priceData.change === 0 ? '0' : formatNumber(priceData.change)}({priceData.change === 0 ? '0%' : (priceData.changePercent > 0 ? '+' : '') + priceData.changePercent.toFixed(1) + '%'})
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-[15px] font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong leading-normal line-clamp-2 title-font mb-auto">
                                                {title}
                                            </h3>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between text-[12px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                                <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                                    <span>{timeFormat}</span>
                                                    <span>•</span>
                                                    <span className="truncate">{source}</span>
                                                </div>

                                                <div className="flex items-center gap-2.5 shrink-0 ml-2 font-medium">
                                                    {audioDur > 0 && (
                                                        <div className="flex items-center gap-1 opacity-80">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                                <rect x="2" y="9" width="4" height="6" rx="1" />
                                                                <rect x="10" y="4" width="4" height="16" rx="1" />
                                                                <rect x="18" y="9" width="4" height="6" rx="1" />
                                                            </svg>
                                                            <span>{durString}</span>
                                                        </div>
                                                    )}
                                                    <div className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 flex items-center justify-center transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/20">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2Z" />
                                                            <path d="M15 12 10 8v8l5-4Z" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>

            {/* Right Column */}
            <aside className={styles.rightColumn}>
                {/* Company Info */}
                <section className={`${styles.section} ${styles.sectionCompanyInfo}`}>
                    <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] uppercase tracking-wider font-semibold text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                                Full Name
                            </span>
                            <span className="text-[15px] font-medium leading-relaxed text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                                {stockInfo?.companyName}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-6 pt-2 border-t border-gray-50 dark:border-gray-800/50">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] uppercase tracking-wider font-semibold text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                                    Exchange
                                </span>
                                <span className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                    {stockInfo?.exchange}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] uppercase tracking-wider font-semibold text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                                    Sector
                                </span>
                                <span className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                    {stockInfo?.sector}
                                </span>
                            </div>
                        </div>

                        {/* Description - Seamlessly follows */}
                        <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-50 dark:border-gray-800/50">
                            <span className="text-[11px] uppercase tracking-wider font-semibold text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                                Introduction
                            </span>
                            <div className="text-[13px] leading-relaxed text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis text-justify">
                                {stockInfo?.overview?.description
                                    ? (isDescExpanded
                                        ? stockInfo.overview.description
                                        : (stockInfo.overview.description.length > 300
                                            ? stockInfo.overview.description.slice(0, 300) + '...'
                                            : stockInfo.overview.description))
                                    : "No detailed description available for this company."
                                }
                            </div>
                            {stockInfo?.overview?.description && stockInfo.overview.description.length > 300 && (
                                <button
                                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400 self-start mt-1 transition-colors focus:outline-none"
                                >
                                    {isDescExpanded ? 'Show less' : 'Read more'}
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                {/* Key Metrics - Matching Reference Design */}
                {financials && (
                    <section className={`${styles.section} ${styles.sectionMetrics}`}>
                        <div className={styles.metricsGrid} style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {/* P/E Ratio */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>P/E RATIO:</span>
                                <span className={styles.metricValue}>
                                    {financials.pe !== undefined ? financials.pe.toFixed(2) : '-'}
                                </span>
                            </div>

                            {/* P/B Ratio */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>P/B RATIO:</span>
                                <span className={styles.metricValue}>
                                    {financials.pb !== undefined ? financials.pb.toFixed(2) : '-'}
                                </span>
                            </div>

                            {/* EPS */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>EPS:</span>
                                <span className={styles.metricValue}>
                                    {financials.eps !== undefined ? `${formatNumber(financials.eps, { maximumFractionDigits: 0 })} đ` : '-'}
                                </span>
                            </div>

                            {/* Net Profit Margin */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>NET PROFIT MARGIN:</span>
                                <span className={styles.metricValue}>
                                    {financials.netProfitMargin !== undefined
                                        ? `${financials.netProfitMargin.toFixed(1)}%`
                                        : '-'}
                                </span>
                            </div>

                            {/* ROE */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>ROE (%):</span>
                                <span className={styles.metricValue}>
                                    {financials.roe !== undefined ? `${financials.roe.toFixed(1)}%` : '-'}
                                </span>
                            </div>

                            {/* ROA */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>ROA (%):</span>
                                <span className={styles.metricValue}>
                                    {financials.roa !== undefined ? `${financials.roa.toFixed(1)}%` : '-'}
                                </span>
                            </div>

                            {/* Profit Growth */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>PROFIT GROWTH:</span>
                                <span className={styles.metricValue}>
                                    {financials.profitGrowth !== undefined
                                        ? `${(Math.abs(financials.profitGrowth) < 1
                                            ? financials.profitGrowth * 100
                                            : financials.profitGrowth).toFixed(1)}%`
                                        : '-'}
                                </span>
                            </div>

                            {/* Debt/Equity */}
                            <div className={styles.metricCard}>
                                <span className={styles.metricLabel}>DEBT/EQUITY:</span>
                                <span className={styles.metricValue}>
                                    {financials.debtToEquity !== undefined
                                        ? financials.debtToEquity.toFixed(2)
                                        : '-'}
                                </span>
                            </div>
                        </div>
                        <p className="text-[11px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle mt-3 italic text-center">
                            * Data from most recent quarter
                        </p>
                    </section>
                )}
            </aside>


        </>
    );
}

// Prevent re-renders from parent price polling — only re-render when actual content changes
export default React.memo(OverviewTab);
