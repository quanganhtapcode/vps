'use client';

import React, { useEffect, useState } from 'react';
import { fetchPriceHistory } from '@/lib/stockApi';
import { formatNumber } from '@/lib/api';
import type { PriceData } from '@/lib/types';

interface PriceHistoryTabProps {
    symbol: string;
    initialData?: any[];
}

type PeriodType = '1M' | '6M' | '1Y' | '3Y' | '5Y';

import { Select, SelectItem } from '@tremor/react';

export default function PriceHistoryTab({ symbol, initialData }: PriceHistoryTabProps) {
    const [allPriceData, setAllPriceData] = useState<PriceData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodType>('1Y');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialData && initialData.length > 0) {
            setAllPriceData(initialData as PriceData[]);
            setIsLoading(false);
            return;
        }

        async function loadPrices() {
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchPriceHistory(symbol, 'ALL');

                // Helper to normalize price (x1000 if in thousands)
                const normalize = (val: number) => (val > 0 && val < 500) ? val * 1000 : val;

                const normalized = data.map((item: any) => ({
                    time: item.time || item.date || item.Date,
                    open: normalize(item.open || item.Open || 0),
                    high: normalize(item.high || item.High || 0),
                    low: normalize(item.low || item.Low || 0),
                    close: normalize(item.close || item.Close || 0),
                    volume: item.volume || item.Volume || 0,
                }));
                normalized.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
                setAllPriceData(normalized);
            } catch (err) {
                setError('Failed to load price data');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        loadPrices();
    }, [symbol, initialData]);

    const priceData = React.useMemo(() => {
        if (!allPriceData || allPriceData.length === 0) return [];
        const now = new Date();
        const cutoff = new Date();
        switch (period) {
            case '1M': cutoff.setMonth(now.getMonth() - 1); break;
            case '6M': cutoff.setMonth(now.getMonth() - 6); break;
            case '1Y': cutoff.setFullYear(now.getFullYear() - 1); break;
            case '3Y': cutoff.setFullYear(now.getFullYear() - 3); break;
            case '5Y': cutoff.setFullYear(now.getFullYear() - 5); break;
        }
        return allPriceData.filter(d => new Date(d.time) >= cutoff);
    }, [allPriceData, period]);

    const handleDownload = () => {
        if (!priceData || priceData.length === 0) return;
        const header = 'DATE,OPEN,HIGH,LOW,CLOSE,VOLUME';
        const rows = priceData.map(row => {
            const dateStr = new Date(row.time).toISOString().split('T')[0];
            return `${dateStr},${row.open},${row.high},${row.low},${row.close},${row.volume}`;
        });
        const csvContent = '\uFEFF' + [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${symbol}_price_history_${period}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const periodButtons: { id: PeriodType; label: string }[] = [
        { id: '1M', label: '1M' },
        { id: '6M', label: '6M' },
        { id: '1Y', label: '1Y' },
        { id: '3Y', label: '3Y' },
        { id: '5Y', label: '5Y' },
    ];

    return (
        <div className="space-y-6 pb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex items-center justify-between gap-4">
                {/* Title */}
                <h3 className="text-tremor-title font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong whitespace-nowrap">
                    Price History
                </h3>

                {/* Toolbar */}
                <div className="flex items-center gap-2">
                    <Select
                        className="w-[80px] sm:w-fit [&>button]:rounded-tremor-small"
                        enableClear={false}
                        value={period}
                        onValueChange={(value) => setPeriod(value as PeriodType)}
                    >
                        {periodButtons.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </Select>

                    {/* Download Button */}
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="inline-flex items-center justify-center gap-2 rounded-tremor-small border border-tremor-border bg-white px-3 py-2 text-tremor-default font-medium text-tremor-content-strong shadow-sm hover:bg-tremor-background-muted dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-strong"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span className="hidden sm:inline">Export CSV</span>
                        <span className="sm:hidden">CSV</span>
                    </button>
                </div>
            </div>


            {/* Content Content */}
            {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <div className="spinner" />
                </div>
            ) : error ? (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '40px' }}>⚠️ {error}</div>
            ) : priceData.length === 0 ? (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '60px' }}>
                    No price history data found for this period
                </div>
            ) : (
                <div className="w-full overflow-x-auto rounded-xl border border-tremor-border bg-white shadow-sm dark:border-dark-tremor-border dark:bg-gray-950">
                    <table className="w-full border-collapse min-w-[600px]">
                        <thead className="bg-gray-50/50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">Date</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">Open</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">High</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">Low</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">Close</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tremor-content dark:text-dark-tremor-content border-b border-tremor-border dark:border-dark-tremor-border">Volume</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {[...priceData].reverse().map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                                    <td className="px-4 py-3 text-sm font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                        {new Date(item.time).toISOString().split('T')[0]}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-tremor-content dark:text-dark-tremor-content">
                                        {formatNumber(item.open)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-tremor-content dark:text-dark-tremor-content">
                                        {formatNumber(item.high)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-tremor-content dark:text-dark-tremor-content">
                                        {formatNumber(item.low)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-tremor-content dark:text-dark-tremor-content">
                                        {formatNumber(item.close)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600 dark:text-emerald-500">
                                        {formatNumber(item.volume)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
