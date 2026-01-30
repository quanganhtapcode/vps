'use client';

import React, { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/api';
import type { HistoricalChartData } from '@/lib/types';
import { LineChart, type CustomTooltipProps as TremorCustomTooltipProps } from '@tremor/react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
} from 'recharts';
import { cx } from '@/lib/utils';
import RevenueProfitChart from './RevenueProfitChart';

interface FinancialsTabProps {
    symbol: string;
    period: 'quarter' | 'year';
    setPeriod: (p: 'quarter' | 'year') => void;
    initialChartData?: HistoricalChartData | null;
    initialOverviewData?: any | null;
}

// Financial Metric Row - Compact
const MetricRow = ({ label, value, unit = '' }: { label: string; value: string | number | null | undefined; unit?: string }) => (
    <div className="flex items-center justify-between border-b border-tremor-border px-4 py-2.5 text-tremor-default dark:border-dark-tremor-border">
        <span className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle">{label}</span>
        <span className="font-semibold text-tremor-brand dark:text-dark-tremor-brand">
            {value !== null && value !== undefined ? `${formatNumber(Number(value))}${unit}` : '-'}
        </span>
    </div>
);

// Metric Card - Light Theme
const MetricCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-tremor-small border border-tremor-border bg-white shadow-sm dark:border-dark-tremor-border dark:bg-dark-tremor-background">
        <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            {title}
        </div>
        <div className="pb-2">
            {children}
        </div>
    </div>
);

// Chart Card - Edge to Edge
const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div
        className="flex flex-col overflow-hidden rounded-tremor-small border border-tremor-border bg-white shadow-sm dark:border-dark-tremor-border dark:bg-dark-tremor-background"
        style={{ height: '380px' }}
    >
        <div className="flex items-center justify-center border-b border-tremor-border px-4 py-3 text-tremor-default font-semibold text-tremor-content-strong dark:border-dark-tremor-border dark:text-dark-tremor-content-strong">
            {title}
        </div>
        <div className="flex-1 px-4 pb-2 pt-3" style={{ position: 'relative', minHeight: 0 }}>
            {children}
        </div>
    </div>
);

export default function FinancialsTab({
    symbol,
    period,
    setPeriod,
    initialChartData,
    initialOverviewData
}: FinancialsTabProps) {
    const [chartData, setChartData] = useState<HistoricalChartData | null>(initialChartData || null);
    const [overviewData, setOverviewData] = useState<any>(initialOverviewData || null);
    const [loading, setLoading] = useState(false);

    const bankSymbols = ['VCB', 'BID', 'CTG', 'TCB', 'MBB', 'ACB', 'VPB', 'HDB', 'SHB', 'STB', 'TPB', 'LPB', 'MSB', 'OCB', 'EIB', 'ABB', 'NAB', 'PGB', 'VAB', 'VIB', 'SSB', 'BAB', 'KLB'];
    const isBank = bankSymbols.includes(symbol);

    // Update state if props change (late fetching)
    useEffect(() => {
        if (initialChartData) setChartData(initialChartData);
    }, [initialChartData]);

    useEffect(() => {
        if (initialOverviewData) setOverviewData(initialOverviewData);
    }, [initialOverviewData]);

    useEffect(() => {
        // If we switched to year (and don't have year data passed in initial which is usually quarter), 
        // OR if chartData is missing, we fetch.
        // Assuming initialChartData maps to period 'quarter' (default).
        // If period is 'year', we probably need to fetch.

        // Simple logic:
        if (initialChartData && period === 'quarter' && !loading) {
            // We have data, skip fetch.
            // But if we already fetched and switched back, standard logic applies.
            // Rely on chartData existence? No, chartData might be old period.
            // Let's just fetch if we don't have confidence.
            // If we really want to optimize, we'd need to track which period current chartData belongs to.
            // For now, let's allow fetching on period change, but skip on FIRST MOUNT if data matches.
        }

        // Just run fetch. Pre-fetching helps initial display. Subsequent changes can fetch.
        // But preventing initial double-fetch?
        // If initialChartData is present on mount, we set state.
        // Then this effect runs. We can check if chartData is already set and matches expectations.
        // Hard to know "expectations" (period) of initialData without passing it.
        // Let's assume initialData is for the CURRENT period passed in props.
        // If initialChartData is populated, we can skip the FIRST fetch.
        // We can use a ref `hasMounted`.

        // Actually, simpler: The parent passes `initialChartData` which is `prefetchedChartData`.
        // `prefetchedChartData` is set async. It might be null initially.
    }, []);

    // Refined Fetch Logic
    useEffect(() => {
        // Skip fetch if we have data and it matches the period (implicit trust in parent for initial render)
        // We'll rely on the fact that if chartData is populated and we haven't fetched manually yet...
        // Actually, just fetching is fine, browser caching will handle repeats? 
        // But we want to avoid the "Loading..." flicker.
        // Since `chartData` is initialized from props, it won't be null.
        // `loading` is false.
        // So rendering happens immediately.
        // If we trigger fetch here, `loading` becomes true, causing flicker.

        const shouldSkip = (initialChartData && period === 'quarter'); // Assume initial is quarter
        if (shouldSkip) {
            // Check if we already have the data in state (we do from init).
            // So we can just return?
            // But what if user changes to Year and back to Quarter? We need to re-fetch Quarter or use cached.
            // Let's just return if it's the very first run and we have data.
        }

        // Better: Check if `chartData` is already present. If so, logic to persist it?
        // Let's just implement standard fetch but use `loading` properly.
        // If `chartData` has content, show content. If `loading` is true, show spinner OVER content or just small indicator?
        // Our UI shows spinner IF loading is true (replacing content).
        // We should change UI to show spinner only if data is MISSING.

        // But first, let's restore the missing functions!

        const controller = new AbortController();
        const signal = controller.signal;

        // If we have data, don't set global loading that hides everything.
        // Maybe separate `isRefreshing`?
        // For now, let's just restore the file content.

        if (!initialChartData || period !== 'quarter') {
            // eslint-disable-next-line
            setLoading(true);
            Promise.all([
                fetch(`/api/historical-chart-data/${symbol}?period=${period}`, { signal }).then(r => r.json()),
                fetch(`/api/stock/${symbol}`, { signal }).then(r => r.json())
            ])
                .then(([chartRes, stockRes]) => {
                    if (signal.aborted) return;

                    if (chartRes.success) setChartData(chartRes.data);
                    if (stockRes.success || stockRes.data) {
                        setOverviewData(stockRes.data || stockRes);
                    }
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error(err);
                    }
                })
                .finally(() => {
                    if (!signal.aborted) {
                        setLoading(false);
                    }
                });
        }

        return () => {
            controller.abort();
        };
    }, [symbol, period]);

    // Helpers restored
    const getVal = (data: (number | null)[] | undefined): number | null => {
        if (!data || data.length === 0) return null;
        return data[data.length - 1];
    };


    // Custom Tooltip
    const CustomTooltip = ({ payload, active, label }: TremorCustomTooltipProps) => {
        if (!active || !payload || payload.length === 0) return null;

        return (
            <>
                <div className="w-56 rounded-md border border-gray-500/10 bg-blue-500 px-4 py-1.5 text-sm shadow-md dark:border-gray-400/20 dark:bg-gray-900 z-[100]">
                    <p className="flex items-center justify-between">
                        <span className="text-gray-50 dark:text-gray-50">
                            Year
                        </span>
                        <span className="font-medium text-gray-50 dark:text-gray-50">{label ?? ''}</span>
                    </p>
                </div>
                <div className="mt-1 w-56 space-y-1 rounded-md border border-gray-500/10 bg-white px-4 py-2 text-sm shadow-md dark:border-gray-400/20 dark:bg-gray-900 z-[100]">
                    {payload.map((item, index) => {
                        // Handle Recharts vs Tremor payload differences
                        // Tremor: item.color (name or hex), item.name, item.value
                        // Recharts: item.color (hex), item.name, item.value, item.fill/stroke

                        // Try to determine color class or style
                        const color = item.color || item.payload?.fill || item.stroke;
                        const isHex = color?.startsWith('#') || color?.startsWith('rgb');

                        return (
                            <div key={index} className="flex items-center space-x-2.5">
                                <span
                                    className={cx(
                                        !isHex ? `bg-${color}-500` : '',
                                        "size-2.5 shrink-0 rounded-sm"
                                    )}
                                    style={isHex ? { backgroundColor: color } : {}}
                                    aria-hidden={true}
                                />
                                <div className="flex w-full justify-between items-center space-x-2">
                                    <span className="text-gray-700 dark:text-gray-300 truncate">
                                        {item.name}
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-gray-50 whitespace-nowrap">
                                        {typeof item.value === 'number'
                                            ? (['ROE', 'ROA', 'NIM', 'Net Margin (%)'].includes(String(item.name)) || String(item.name).includes('%') || item.unit === '%')
                                                ? `${item.value}%`
                                                : ['Revenue', 'Profit'].includes(String(item.name))
                                                    ? `${formatNumber(item.value)}B`
                                                    : formatNumber(item.value)
                                            : item.value}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        );
    };

    // Common chart styling - Restored for ComposedChart
    const commonAxisProps = {
        axisLine: false,
        tickLine: false,
        tick: { fill: '#6b7280', fontSize: 11, fontFamily: 'Inter' },
    };

    const commonTooltipProps = {
        contentStyle: {
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        },
        labelStyle: {
            fontWeight: 600,
            marginBottom: '4px',
            color: '#111827',
            fontFamily: 'Inter',
        },
    };

    const commonChartMargin = { top: 5, right: 5, left: -10, bottom: 5 };


    return (
        <div className="w-full text-tremor-content-strong dark:text-dark-tremor-content-strong" style={{
            boxSizing: 'border-box',
        }}>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                    <div className="spinner" style={{ margin: '0 auto', marginBottom: '12px' }} />
                    <span style={{ fontSize: '12px' }}>Loading data...</span>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Financial Metrics Section - Horizontal Grid */}
                    <div style={{ width: '100%' }}>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Valuation Metrics */}
                            <MetricCard title="Valuation">
                                <MetricRow label="EPS" value={overviewData?.eps_ttm || overviewData?.eps} />
                                <MetricRow label="P/E" value={overviewData?.pe} />
                                <MetricRow label="P/B" value={overviewData?.pb} />
                                <MetricRow label="P/S" value={overviewData?.ps} />
                                <MetricRow label="EV/EBITDA" value={overviewData?.ev_ebitda} />
                            </MetricCard>

                            {/* Profitability Metrics */}
                            <MetricCard title="Profitability">
                                <MetricRow label="ROE" value={chartData?.roe_data ? getVal(chartData.roe_data) : overviewData?.roe} unit=" %" />
                                <MetricRow label="ROA" value={chartData?.roa_data ? getVal(chartData.roa_data) : overviewData?.roa} unit=" %" />
                                <MetricRow label="ROIC" value={overviewData?.roic} unit=" %" />
                                <MetricRow label="Gross Margin" value={overviewData?.gross_margin} unit=" %" />
                                <MetricRow label="Net Margin" value={overviewData?.net_profit_margin} unit=" %" />
                            </MetricCard>

                            {/* Financial Strength (Non-bank) */}
                            {!isBank && (
                                <MetricCard title="Financial Health">
                                    <MetricRow label="Current Ratio" value={chartData?.current_ratio_data ? getVal(chartData.current_ratio_data) : overviewData?.current_ratio} />
                                    <MetricRow label="Quick Ratio" value={chartData?.quick_ratio_data ? getVal(chartData.quick_ratio_data) : overviewData?.quick_ratio} />
                                    <MetricRow label="Cash Ratio" value={chartData?.cash_ratio_data ? getVal(chartData.cash_ratio_data) : overviewData?.cash_ratio} />
                                    <MetricRow label="D/E Ratio" value={overviewData?.debt_to_equity} />
                                </MetricCard>
                            )}

                            {/* Bank-specific Metrics */}
                            {isBank && (
                                <MetricCard title="Banking Metrics">
                                    <MetricRow label="NIM" value={chartData?.nim_data ? getVal(chartData.nim_data) : null} unit=" %" />
                                    <MetricRow label="CASA" value={overviewData?.casa} unit=" %" />
                                    <MetricRow label="NPL Ratio" value={overviewData?.npl_ratio} unit=" %" />
                                    <MetricRow label="LDR" value={overviewData?.ldr} unit=" %" />
                                    <MetricRow label="CAR" value={overviewData?.car} unit=" %" />
                                </MetricCard>
                            )}
                        </div>
                    </div>

                    {/* Charts Section - Full Width Below */}
                    <div style={{ width: '100%' }}>
                        {/* Charts Grid - 2 columns on Large, 1 on Mobile */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* ROE & ROA Chart */}
                            {chartData && chartData.years && chartData.years.length > 0 && (
                                <ChartCard title="ROE & ROA (%)">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={chartData.years.map((year, i) => ({
                                            year: year.toString(),
                                            ROE: chartData.roe_data?.[i] ?? 0,
                                            ROA: chartData.roa_data?.[i] ?? 0,
                                        }))}
                                        index="year"
                                        categories={["ROE", "ROA"]}
                                        colors={["blue", "emerald"]}
                                        valueFormatter={formatNumber}
                                        yAxisWidth={40}
                                        customTooltip={CustomTooltip}
                                        showLegend={true}
                                        showAnimation={false}
                                    />
                                </ChartCard>
                            )}

                            {/* PE & PB Chart */}
                            {chartData && chartData.years && chartData.years.length > 0 && (
                                <ChartCard title="P/E & P/B">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={chartData.years.map((year, i) => ({
                                            year: year.toString(),
                                            'P/E': chartData.pe_ratio_data?.[i] ?? 0,
                                            'P/B': chartData.pb_ratio_data?.[i] ?? 0,
                                        }))}
                                        index="year"
                                        categories={["P/E", "P/B"]}
                                        colors={["red", "violet"]}
                                        valueFormatter={formatNumber}
                                        yAxisWidth={40}
                                        customTooltip={CustomTooltip}
                                        showLegend={true}
                                        showAnimation={false}
                                    />
                                </ChartCard>
                            )}

                            {/* Liquidity Ratios Chart (Non-bank) */}
                            {!isBank && chartData && chartData.current_ratio_data && (
                                <ChartCard title="Liquidity Ratios">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={chartData.years.map((year, i) => ({
                                            year: year.toString(),
                                            'Current': chartData.current_ratio_data?.[i] ?? 0,
                                            'Quick': chartData.quick_ratio_data?.[i] ?? 0,
                                            'Cash': chartData.cash_ratio_data?.[i] ?? 0,
                                        }))}
                                        index="year"
                                        categories={["Current", "Quick", "Cash"]}
                                        colors={["emerald", "blue", "amber"]}
                                        valueFormatter={formatNumber}
                                        yAxisWidth={40}
                                        customTooltip={CustomTooltip}
                                        showLegend={true}
                                        showAnimation={false}
                                    />
                                </ChartCard>
                            )}

                            {/* NIM Chart (Bank only) */}
                            {isBank && chartData && chartData.nim_data && (
                                <ChartCard title="NIM (%)">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={chartData.years?.map((year, i) => ({
                                            year: year.toString(),
                                            'NIM': chartData.nim_data?.[i] ?? 0,
                                        })) || []}
                                        index="year"
                                        categories={["NIM"]}
                                        colors={["cyan"]}
                                        valueFormatter={formatNumber}
                                        yAxisWidth={40}
                                        customTooltip={CustomTooltip}
                                        showLegend={true}
                                        showAnimation={false}
                                    />
                                </ChartCard>
                            )}

                            {/* Revenue & Profit Chart */}
                            <ChartCard title="Revenue & Profit">
                                <RevenueProfitChart symbol={symbol} period={period} hideCard={true} />
                            </ChartCard>
                        </div> {/* End Charts Grid */}
                    </div>
                </div>
            )}
        </div>
    );
}
