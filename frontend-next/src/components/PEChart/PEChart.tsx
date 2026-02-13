'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { fetchPEChart, PEChartData } from '@/lib/api';
import { cx, focusInput } from '@/lib/utils';
import styles from './PEChart.module.css';

function formatDateRange(days: number) {
    const end = new Date();
    const start = new Date();
    if (days > 0) {
        start.setDate(end.getDate() - days);
    } else {
        return "All history";
    }
    return `${start.toLocaleDateString('en-US')} – ${end.toLocaleDateString('en-US')}`;
}

type TimeRange = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
    { key: '3M', label: '3M', days: 90 },
    { key: '6M', label: '6M', days: 180 },
    { key: '1Y', label: '1Y', days: 365 },
    { key: '3Y', label: '3Y', days: 1095 },
    { key: '5Y', label: '5Y', days: 1825 },
];

interface PEChartProps {
    initialData?: PEChartData[];
}

interface ChartDataPoint {
    date: string;
    fullDate: string;
    'VN-Index': number;
    'P/E': number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-tremor-default border border-tremor-border bg-tremor-background p-3 shadow-tremor-dropdown dark:border-dark-tremor-border dark:bg-dark-tremor-background z-[100] relative">
                <p className="mb-2 text-xs font-medium text-tremor-content dark:text-dark-tremor-content uppercase tracking-tight">
                    {payload[0].payload.fullDate}
                </p>
                <div className="space-y-1.5">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-sm font-medium text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                                    {entry.name}
                                </span>
                            </div>
                            <span className="text-sm font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                {entry.name === 'VN-Index'
                                    ? entry.value.toLocaleString('en-US')
                                    : entry.value.toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export default function PEChart({ initialData = [] }: PEChartProps) {
    const [data, setData] = useState<PEChartData[]>(initialData);
    const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
    const [isLoading, setIsLoading] = useState(initialData.length === 0);

    const handleRangeChange = useCallback((nextRange: TimeRange) => {
        setTimeRange((prev) => (prev === nextRange ? prev : nextRange));
    }, []);

    useEffect(() => {
        if (initialData.length > 0) return;

        async function loadData() {
            try {
                setIsLoading(true);
                const peData = await fetchPEChart();
                setData(peData);
            } catch (error) {
                console.error('Error loading P/E chart:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [initialData]);

    const filterButtons = useMemo(() => [
        { key: '3M' as TimeRange, label: '3M', days: 90, tooltip: formatDateRange(90) },
        { key: '6M' as TimeRange, label: '6M', days: 180, tooltip: formatDateRange(180) },
        { key: '1Y' as TimeRange, label: '1Y', days: 365, tooltip: formatDateRange(365) },
        { key: '3Y' as TimeRange, label: '3Y', days: 1095, tooltip: formatDateRange(1095) },
        { key: '5Y' as TimeRange, label: '5Y', days: 1825, tooltip: formatDateRange(1825) },
    ], []);

    const chartData = useMemo(() => {
        if (data.length === 0) return [];

        const range = filterButtons.find(r => r.key === timeRange);
        if (!range) return [];

        let filtered = data;
        if (range.days > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - range.days);
            filtered = data.filter(d => d.date >= cutoffDate);
        }

        return filtered.map((d, index) => {
            const day = d.date.getDate().toString().padStart(2, '0');
            const month = (d.date.getMonth() + 1).toString().padStart(2, '0');
            const year = d.date.getFullYear().toString().slice(-2);
            return {
                index, // Dùng index để làm quy chuẩn trục X giúp tooltip mượt hơn
                date: `${month}/${year}`,
                fullDate: d.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
                'VN-Index': d.vnindex,
                'P/E': d.pe,
            };
        });
    }, [data, timeRange, filterButtons]);

    const currentStats = useMemo(() => {
        if (data.length === 0) return { pe: 0, index: 0 };
        const last = data[data.length - 1];
        return { pe: last.pe, index: last.vnindex };
    }, [data]);

    return (
        <section className={styles.section}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {/* Compact Indicators - "Gọn, 1 dòng" */}
                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">P/E</span>
                            <span className="text-lg font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                {currentStats.pe.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">VN-Index</span>
                            <span className="text-lg font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                {currentStats.index.toLocaleString('en-US')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Desktop Filter Buttons */}
                <div className="hidden items-center rounded-tremor-small text-tremor-default font-medium shadow-tremor-input dark:shadow-dark-tremor-input sm:inline-flex">
                    {filterButtons.map((item, index) => (
                        <button
                            key={item.key}
                            type="button"
                            title={item.tooltip}
                            onClick={() => handleRangeChange(item.key)}
                            className={cx(
                                index === 0 ? 'rounded-l-tremor-small' : '-ml-px',
                                index === filterButtons.length - 1 ? 'rounded-r-tremor-small' : '',
                                focusInput,
                                'border border-tremor-border bg-tremor-background px-4 py-2 text-tremor-content-strong hover:bg-tremor-background-muted hover:text-tremor-content-strong focus:z-10 focus:outline-none dark:border-dark-tremor-border dark:bg-gray-950 dark:text-dark-tremor-content-strong hover:dark:bg-gray-950/50 transition-colors',
                                timeRange === item.key ? 'bg-tremor-brand-muted text-tremor-brand dark:bg-dark-tremor-brand-muted dark:text-dark-tremor-brand font-bold' : ''
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
                            onClick={() => handleRangeChange(item.key)}
                            className={cx(
                                index === 0 ? 'rounded-l-tremor-small' : '-ml-px',
                                index === filterButtons.length - 1 ? 'rounded-r-tremor-small' : '',
                                'flex-1 border border-tremor-border bg-tremor-background py-2 text-center text-tremor-content-strong hover:bg-tremor-background-muted hover:text-tremor-content-strong focus:z-10 focus:outline-none dark:border-dark-tremor-border dark:bg-gray-950 dark:text-dark-tremor-content-strong hover:dark:bg-gray-950/50 transition-colors',
                                timeRange === item.key ? 'bg-tremor-brand-muted text-tremor-brand dark:bg-dark-tremor-brand-muted dark:text-dark-tremor-brand font-bold' : ''
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.chartContainer}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <div className={styles.loader} />
                        <span>Loading chart data...</span>
                    </div>
                ) : chartData.length === 0 ? (
                    <div className={styles.noData}>No data found for this period</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e5e7eb"
                                vertical={false}
                                horizontal={true}
                                opacity={0.3}
                            />
                            <XAxis
                                dataKey="index" // Dùng index để đảm bảo mỗi ngày là một điểm riêng biệt
                                axisLine={false}
                                tickLine={false}
                                tick={(props) => {
                                    const { x, y, payload } = props;
                                    const item = chartData[payload.value];
                                    // Chỉ hiển thị label ngày tháng cho những điểm cách xa nhau để tránh bị đè chữ
                                    if (!item || payload.index % Math.ceil(chartData.length / 6) !== 0) return null;
                                    return (
                                        <text x={x} y={y + 20} fill="#9ca3af" fontSize={11} textAnchor="middle">
                                            {item.date}
                                        </text>
                                    );
                                }}
                                interval={0}
                                minTickGap={30}
                            />
                            <YAxis
                                yAxisId="left"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#10b981', fontSize: 11 }}
                                width={45}
                                domain={['auto', 'auto']}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#3b82f6', fontSize: 11 }}
                                width={35}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                            />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="VN-Index"
                                stroke="#10b981"
                                strokeWidth={1.5} // "mỏng được như mẫu của tremor"
                                dot={false}
                                activeDot={{ r: 3, strokeWidth: 0 }}
                                name="VN-Index"
                                isAnimationActive={false}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="P/E"
                                stroke="#3b82f6"
                                strokeWidth={1.5} // "mỏng được như mẫu của tremor"
                                dot={false}
                                activeDot={{ r: 3, strokeWidth: 0 }}
                                name="P/E"
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </section>
    );
}