'use client';

import React, { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/api';
import type { HistoricalChartData } from '@/lib/types';
import { LineChart, type CustomTooltipProps as TremorCustomTooltipProps } from '@tremor/react';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    Cell,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ReferenceLine,
} from 'recharts';
import { cx } from '@/lib/utils';

type FinancialDashboardSeries = {
    period: string;
    year: number;
    quarter: number;
    revenue: number | null;
    net_profit: number | null;
    net_margin: number | null;
    total_debt: number | null;
    total_equity: number | null;
    debt_to_equity_pct: number | null;
};

type FinancialDashboardWaterfall = {
    period: string;
    revenue: number | null;
    cogs: number | null;
    gross_profit: number | null;
    selling_admin_expense: number | null;
    operating_profit: number | null;
    other_income_expense: number | null;
    profit_before_tax: number | null;
    tax: number | null;
    net_profit: number | null;
};

type FinancialDashboardPosition = {
    period: string;
    current_assets: number | null;
    non_current_assets: number | null;
    current_liabilities: number | null;
    non_current_liabilities: number | null;
    total_assets: number | null;
    total_liabilities: number | null;
};

type FinancialDashboardData = {
    series: FinancialDashboardSeries[];
    waterfall: FinancialDashboardWaterfall | null;
    position: FinancialDashboardPosition | null;
};

interface FinancialsTabProps {
    symbol: string;
    period?: 'quarter' | 'year';
    setPeriod?: (p: 'quarter' | 'year') => void;
    initialChartData?: HistoricalChartData | null;
    initialOverviewData?: any | null;
    isLoading?: boolean;
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
    initialOverviewData,
    isLoading: isParentLoading = false
}: FinancialsTabProps) {
    const effectivePeriod: 'quarter' | 'year' = period ?? 'quarter';
    const [chartData, setChartData] = useState<HistoricalChartData | null>(initialChartData || null);
    const [overviewData, setOverviewData] = useState<any>(initialOverviewData || null);
    const [dashboardData, setDashboardData] = useState<FinancialDashboardData | null>(null);
    const [loading, setLoading] = useState<boolean>(!initialChartData && !isParentLoading);

    const bankSymbols = ['VCB', 'BID', 'CTG', 'TCB', 'MBB', 'ACB', 'VPB', 'HDB', 'SHB', 'STB', 'TPB', 'LPB', 'MSB', 'OCB', 'EIB', 'ABB', 'NAB', 'PGB', 'VAB', 'VIB', 'SSB', 'BAB', 'KLB'];
    const isBank = bankSymbols.includes(symbol);

    useEffect(() => {
        if (initialChartData && effectivePeriod === 'quarter') setChartData(initialChartData);
    }, [initialChartData, effectivePeriod]);

    useEffect(() => {
        if (initialOverviewData) setOverviewData(initialOverviewData);
    }, [initialOverviewData]);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        if (effectivePeriod === 'quarter') {
            if (initialChartData) {
                setLoading(false);
                setChartData(initialChartData);
                return;
            }
            if (isParentLoading) {
                setLoading(true);
                return;
            }
        }

        setLoading(true);
        Promise.allSettled([
            fetch(`/api/historical-chart-data/${symbol}?period=${effectivePeriod}`, { signal }).then(r => r.json()),
            fetch(`/api/stock/${symbol}?period=${effectivePeriod}`, { signal }).then(r => r.json()),
            fetch(`/api/stock/${symbol}/financial-dashboard?period=${effectivePeriod}&limit=8`, { signal }).then(r => r.json())
        ])
            .then((results) => {
                if (signal.aborted) return;

                const [chartResult, stockResult, dashboardResult] = results;
                const chartRes = chartResult.status === 'fulfilled' ? chartResult.value : null;
                const stockRes = stockResult.status === 'fulfilled' ? stockResult.value : null;
                const dashRes = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;

                if (chartRes?.success) setChartData(chartRes.data);
                if (stockRes?.success || stockRes?.data) {
                    setOverviewData(stockRes.data || stockRes);
                }
                if (dashRes?.success && dashRes?.data) {
                    setDashboardData(dashRes.data);
                } else {
                    setDashboardData(null);
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

        return () => controller.abort();
    }, [symbol, effectivePeriod, isParentLoading, initialChartData]);

    const chartYears = chartData?.years || [];

    const parseTimeRank = (label: string, fallbackIndex: number): number => {
        const value = String(label || '').trim();

        const qFirst = value.match(/Q\s*([1-4]).*?(\d{2,4})/i);
        if (qFirst) {
            const quarter = Number(qFirst[1]);
            const yRaw = Number(qFirst[2]);
            const year = yRaw < 100 ? 2000 + yRaw : yRaw;
            return year * 10 + quarter;
        }

        const yFirst = value.match(/(\d{4}).*?Q\s*([1-4])/i);
        if (yFirst) {
            const year = Number(yFirst[1]);
            const quarter = Number(yFirst[2]);
            return year * 10 + quarter;
        }

        const yOnly = value.match(/\d{4}/);
        if (yOnly) {
            return Number(yOnly[0]) * 10;
        }

        return fallbackIndex;
    };

    const orderedIndices = chartYears
        .map((label, i) => ({ i, rank: parseTimeRank(String(label), i), label: String(label) }))
        .sort((a, b) => a.rank - b.rank);

    const getLatestVal = (data: (number | null)[] | undefined): number | null => {
        if (!data || data.length === 0) return null;
        for (let i = orderedIndices.length - 1; i >= 0; i--) {
            const idx = orderedIndices[i].i;
            const v = data[idx];
            if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
                return Number(v);
            }
        }
        return null;
    };

    const buildSeries = (mapPoint: (idx: number, label: string) => Record<string, string | number | null>) => {
        return orderedIndices.map(({ i, label }) => mapPoint(i, label));
    };

    const pickOverview = (...keys: string[]): number | null => {
        if (!overviewData) return null;
        for (const key of keys) {
            const value = overviewData?.[key];
            if (value === null || value === undefined || value === '') continue;
            const numeric = Number(value);
            if (!Number.isNaN(numeric)) return numeric;
        }
        return null;
    };

    const computedEvEbitda = (): number | null => {
        return pickOverview('ev_to_ebitda', 'ev_ebitda', 'evEbitda', 'enterprise_to_ebitda');
    };

    const getEpsForPeriod = (): number | null => {
        if (effectivePeriod === 'quarter') {
            return (
                pickOverview('eps', 'earnings_per_share', 'basic_eps', 'eps_quarter')
                ?? pickOverview('eps_ttm')
            );
        }
        return pickOverview('eps_ttm', 'eps', 'earnings_per_share', 'basic_eps');
    };

    // Helpers restored
    const nimSeriesFromChart = buildSeries((i, label) => ({
        year: label,
        NIM: chartData?.nim_data?.[i] ?? null,
    })).filter((point) => {
        if (point.NIM === null || point.NIM === undefined) return false;
        return Number(point.NIM) !== 0;
    });

    const hasNimSeries = nimSeriesFromChart.length > 0;
    const latestNimFromSeries = hasNimSeries ? nimSeriesFromChart[nimSeriesFromChart.length - 1].NIM : null;

    const nimChartSeries = hasNimSeries
        ? nimSeriesFromChart
        : (overviewData?.nim !== null && overviewData?.nim !== undefined
            ? [{ year: 'Latest', NIM: Number(overviewData.nim) }]
            : []);

    const dashboardSeries = dashboardData?.series || [];
    const hasDashboardSeries = dashboardSeries.length > 0;
    const performanceSeries = dashboardSeries.map((item) => ({
        period: item.period,
        Revenue: item.revenue ?? 0,
        'Lợi nhuận ròng': item.net_profit ?? 0,
        'Biên LN ròng': item.net_margin ?? 0,
    }));
    const debtEquitySeries = dashboardSeries.map((item) => ({
        period: item.period,
        'Nợ vay': item.total_debt ?? 0,
        'Vốn chủ sở hữu': item.total_equity ?? 0,
        'Nợ vay/VCSH': item.debt_to_equity_pct ?? 0,
    }));

    const waterfall = dashboardData?.waterfall;
    const waterfallSeries = waterfall
        ? [
            { name: 'Doanh thu thuần', value: waterfall.revenue ?? 0 },
            { name: 'Giá vốn hàng bán', value: -Math.abs(waterfall.cogs ?? 0) },
            { name: 'Lợi nhuận gộp', value: waterfall.gross_profit ?? 0 },
            { name: 'CP bán hàng & QLDN', value: -Math.abs(waterfall.selling_admin_expense ?? 0) },
            { name: 'LN hoạt động', value: waterfall.operating_profit ?? 0 },
            { name: 'LN khác', value: waterfall.other_income_expense ?? 0 },
            { name: 'LN trước thuế', value: waterfall.profit_before_tax ?? 0 },
            { name: 'Thuế TNDN', value: -Math.abs(waterfall.tax ?? 0) },
            { name: 'Lợi nhuận ròng', value: waterfall.net_profit ?? 0 },
        ]
        : [];

    const position = dashboardData?.position;
    const positionSeries = position
        ? [
            {
                group: 'Ngắn hạn',
                'Tài sản': position.current_assets ?? 0,
                'Nợ phải trả': position.current_liabilities ?? 0,
            },
            {
                group: 'Dài hạn',
                'Tài sản': position.non_current_assets ?? 0,
                'Nợ phải trả': position.non_current_liabilities ?? 0,
            },
        ]
        : [];


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
                                <MetricRow label="EPS" value={getEpsForPeriod()} />
                                <MetricRow label="P/E" value={chartData?.pe_ratio_data ? getLatestVal(chartData.pe_ratio_data) : pickOverview('pe', 'pe_ratio', 'PE')} />
                                <MetricRow label="P/B" value={chartData?.pb_ratio_data ? getLatestVal(chartData.pb_ratio_data) : pickOverview('pb', 'pb_ratio', 'PB')} />
                                <MetricRow label="P/S" value={pickOverview('ps', 'p_s', 'price_to_sales')} />
                                <MetricRow label="P/CF" value={pickOverview('p_cash_flow', 'pcf_ratio', 'price_to_cash_flow')} />
                                <MetricRow label="EV/EBITDA" value={computedEvEbitda()} />
                            </MetricCard>

                            {/* Profitability Metrics */}
                            <MetricCard title="Profitability">
                                <MetricRow label="ROE" value={chartData?.roe_data ? getLatestVal(chartData.roe_data) : pickOverview('roe', 'ROE')} unit=" %" />
                                <MetricRow label="ROA" value={chartData?.roa_data ? getLatestVal(chartData.roa_data) : pickOverview('roa', 'ROA')} unit=" %" />
                                <MetricRow label="ROIC" value={pickOverview('roic')} unit=" %" />
                                <MetricRow label="Gross Margin" value={pickOverview('gross_margin', 'grossProfitMargin')} unit=" %" />
                                <MetricRow label="Net Margin" value={pickOverview('net_profit_margin', 'netProfitMargin')} unit=" %" />
                            </MetricCard>

                            {/* Financial Strength (Non-bank) */}
                            {!isBank && (
                                <MetricCard title="Financial Health">
                                    <MetricRow label="Current Ratio" value={chartData?.current_ratio_data ? getLatestVal(chartData.current_ratio_data) : pickOverview('current_ratio', 'currentRatio')} />
                                    <MetricRow label="Quick Ratio" value={chartData?.quick_ratio_data ? getLatestVal(chartData.quick_ratio_data) : pickOverview('quick_ratio', 'quickRatio')} />
                                    <MetricRow label="Cash Ratio" value={chartData?.cash_ratio_data ? getLatestVal(chartData.cash_ratio_data) : pickOverview('cash_ratio', 'cashRatio')} />
                                    <MetricRow label="D/E Ratio" value={pickOverview('debt_to_equity', 'debtToEquity', 'de')} />
                                    <MetricRow label="Interest Coverage" value={pickOverview('interest_coverage', 'interest_coverage_ratio')} />
                                    <MetricRow label="Asset Turnover" value={pickOverview('asset_turnover')} />
                                </MetricCard>
                            )}

                            {/* Bank-specific Metrics */}
                            {isBank && (
                                <MetricCard title="Banking Metrics">
                                    <MetricRow label="NIM" value={hasNimSeries ? latestNimFromSeries : (overviewData?.nim ?? null)} unit=" %" />
                                    <MetricRow label="COF" value={overviewData?.cof} unit=" %" />
                                    <MetricRow label="CIR" value={overviewData?.cir} unit=" %" />
                                    <MetricRow label="LDR" value={overviewData?.ldr} unit=" %" />
                                </MetricCard>
                            )}
                        </div>
                    </div>

                    {/* Charts Section - Full Width Below */}
                    <div style={{ width: '100%' }}>
                        {/* Charts Grid - 2 columns on Large, 1 on Mobile */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* ROE & ROA Chart */}
                            {chartData && orderedIndices.length > 0 && (
                                <ChartCard title="ROE & ROA (%)">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={buildSeries((i, label) => ({
                                            year: label,
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
                            {chartData && orderedIndices.length > 0 && (
                                <ChartCard title="P/E & P/B">
                                    <LineChart
                                        className="h-full w-full"
                                        style={{ height: '100%', width: '100%' }}
                                        data={buildSeries((i, label) => ({
                                            year: label,
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

                            {hasDashboardSeries && (
                                <ChartCard title="Hiệu suất">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={performanceSeries}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                            <YAxis yAxisId="left" tickFormatter={(v) => formatNumber(Number(v))} width={60} />
                                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${Number(v).toFixed(2)}%`} width={60} />
                                            <RechartsTooltip
                                                formatter={(value: any, name?: string) => {
                                                    const metricName = name ?? '';
                                                    return String(metricName).includes('Biên')
                                                        ? [`${Number(value).toFixed(2)}%`, metricName]
                                                        : [formatNumber(Number(value)), metricName];
                                                }}
                                            />
                                            <Legend />
                                            <Bar yAxisId="left" dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            <Bar yAxisId="left" dataKey="Lợi nhuận ròng" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                                            <Line yAxisId="right" type="monotone" dataKey="Biên LN ròng" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            )}

                            {waterfallSeries.length > 0 && (
                                <ChartCard title={`Kết quả kinh doanh (${waterfall?.period ?? ''})`}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={waterfallSeries}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                                            <YAxis tickFormatter={(v) => formatNumber(Number(v))} width={60} />
                                            <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                                            <RechartsTooltip formatter={(value: any) => formatNumber(Number(value))} />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {waterfallSeries.map((entry, index) => (
                                                    <Cell
                                                        key={`wf-${index}`}
                                                        fill={entry.value >= 0 ? '#647aa3' : '#d76b93'}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            )}

                            {hasDashboardSeries && (
                                <ChartCard title="Tài sản và Vốn chủ sở hữu">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={debtEquitySeries}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                            <YAxis yAxisId="left" tickFormatter={(v) => formatNumber(Number(v))} width={60} />
                                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={60} />
                                            <RechartsTooltip
                                                formatter={(value: any, name?: string) => {
                                                    const metricName = name ?? '';
                                                    return String(metricName).includes('%') || String(metricName).includes('VCSH')
                                                        ? [`${Number(value).toFixed(2)}%`, metricName]
                                                        : [formatNumber(Number(value)), metricName];
                                                }}
                                            />
                                            <Legend />
                                            <Bar yAxisId="left" dataKey="Nợ vay" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                                            <Bar yAxisId="left" dataKey="Vốn chủ sở hữu" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                                            <Line yAxisId="right" type="monotone" dataKey="Nợ vay/VCSH" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            )}

                            {positionSeries.length > 0 && (
                                <ChartCard title={`Vị thế tài chính (${position?.period ?? ''})`}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={positionSeries}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                                            <XAxis dataKey="group" tick={{ fontSize: 12 }} />
                                            <YAxis tickFormatter={(v) => formatNumber(Number(v))} width={60} />
                                            <RechartsTooltip formatter={(value: any) => formatNumber(Number(value))} />
                                            <Legend />
                                            <Bar dataKey="Tài sản" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Nợ phải trả" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            )}

                        </div> {/* End Charts Grid */}
                    </div>
                </div>
            )}
        </div>
    );
}
