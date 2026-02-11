'use client';

import React, { useEffect, useState } from 'react';
import {
    Card,
    Title,
    Text,
    Grid,
    Col,
    Table,
    TableHead,
    TableRow,
    TableHeaderCell,
    TableBody,
    TableCell,
    Badge,
} from '@tremor/react';
import { LineChart } from '@tremor/react';
import { formatNumber } from '@/lib/api';
import { cx } from '@/lib/utils';

interface Peer {
    symbol: string;
    name: string;
    pe: number | null;
    pb: number | null;
    roe: number | null;
    roa: number | null;
    marketCap: number | null;
    netMargin: number | null;
    profitGrowth: number | null;
    isCurrent: boolean;
}

interface AnalysisTabProps {
    symbol: string;
    sector: string;
    initialPeers?: any;
    initialHistory?: any;
    isLoading?: boolean;
}

const AnalysisTab = ({ symbol, sector, initialPeers, initialHistory, isLoading = false }: AnalysisTabProps) => {
    const [peers, setPeers] = useState<Peer[]>(initialPeers?.data || initialPeers?.peers || []);
    const [peHistory, setPeHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(!initialPeers && !initialHistory);
    const [medianPe, setMedianPe] = useState<number | null>(initialPeers?.medianPe || null);

    // Synchronize state if props arrive after mount
    useEffect(() => {
        if ((initialPeers?.data || initialPeers?.peers) && peers.length === 0) {
            setPeers(initialPeers.data || initialPeers.peers);
            setMedianPe(initialPeers.medianPe);
            if (peHistory.length > 0) setLoading(false);
        }
    }, [initialPeers]);

    useEffect(() => {
        if (initialHistory && peHistory.length === 0) {
            const data = initialHistory;
            const formattedHistory = data.years.map((period: string, i: number) => ({
                period,
                'P/E': data.pe_ratio_data[i] || 0,
                'P/B': data.pb_ratio_data[i] || 0,
            })).filter((item: any) => item['P/E'] > 0);
            setPeHistory(formattedHistory);
            if (peers.length > 0) setLoading(false);
        }
    }, [initialHistory]);

    useEffect(() => {
        const fetchData = async () => {
            // Wait for parent loading
            if (isLoading) return;

            // If already loaded or props exist, skip
            if (peers.length > 0 && peHistory.length > 0) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const [peersRes, historyRes] = await Promise.all([
                    peers.length === 0
                        ? fetch(`/api/stock/peers/${symbol}?industry=${encodeURIComponent(sector)}`).then(r => r.json())
                        : Promise.resolve({ success: true, peers, medianPe }),
                    (peHistory.length === 0 && !initialHistory)
                        ? fetch(`/api/historical-chart-data/${symbol}?period=quarter`).then(r => r.json())
                        : Promise.resolve({ success: true, data: initialHistory })
                ]);

                if (peersRes.success) {
                    setPeers(peersRes.data || peersRes.peers || []);
                    setMedianPe(peersRes.medianPe);
                }

                if (historyRes.success && historyRes.data) {
                    const data = historyRes.data;
                    const formattedHistory = data.years.map((period: string, i: number) => ({
                        period,
                        'P/E': data.pe_ratio_data[i] || 0,
                        'P/B': data.pb_ratio_data[i] || 0,
                    })).filter((item: any) => item['P/E'] > 0);
                    setPeHistory(formattedHistory);
                }
            } catch (error) {
                console.error("Error fetching analysis data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [symbol, sector, isLoading, initialHistory]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="spinner" />
                <span className="ml-3 text-tremor-default text-tremor-content">Loading analysis...</span>
            </div>
        );
    }

    // Sort peers locally just in case, but respect backend order
    // const sortedPeers = [...peers].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    return (
        <div className="space-y-8">
            {/* Historical valuation */}
            <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <div>
                        <Title>Valuation History</Title>
                        <Text>Historical P/E and P/B ratios over time</Text>
                    </div>
                    {peHistory.length > 0 && (
                        <div className="flex gap-4">
                            <div className="text-right">
                                <Text className="text-xs uppercase font-semibold text-tremor-content-subtle">Current P/E</Text>
                                <Title className="text-blue-600">{peHistory[peHistory.length - 1]['P/E'].toFixed(2)}</Title>
                            </div>
                            <div className="text-right">
                                <Text className="text-xs uppercase font-semibold text-tremor-content-subtle">Current P/B</Text>
                                <Title className="text-violet-600">{peHistory[peHistory.length - 1]['P/B'].toFixed(2)}</Title>
                            </div>
                        </div>
                    )}
                </div>
                <div className="h-80">
                    <LineChart
                        className="h-full"
                        data={peHistory}
                        index="period"
                        categories={["P/E", "P/B"]}
                        colors={["blue", "violet"]}
                        valueFormatter={(number: number) => number.toFixed(2)}
                        showAnimation={false}
                        showLegend={true}
                        showTooltip={true}
                        autoMinValue={true}
                        yAxisWidth={40}
                    />
                </div>
            </Card>

            {/* Peer Comparison */}
            <Card className="p-0 overflow-hidden">
                <div className="p-6 border-b border-tremor-border dark:border-dark-tremor-border bg-tremor-background-muted/50 dark:bg-dark-tremor-background-muted/20">
                    <div className="sm:flex sm:items-center sm:justify-between sm:space-x-10">
                        <div>
                            <h3 className="text-lg font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                Industry Comparison
                            </h3>
                            <p className="mt-1 text-tremor-default leading-6 text-tremor-content dark:text-dark-tremor-content">
                                Comparison with top {sector} peers ranked by Market Cap.
                            </p>
                        </div>
                        {medianPe && (
                            <div className="mt-4 sm:mt-0">
                                <span className="inline-flex items-center rounded-tremor-small bg-blue-50 px-3 py-1.5 text-tremor-default font-bold text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/20">
                                    Industry Median P/E: {medianPe.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="px-4 pb-4">
                    <Table className="h-[450px] [&>table]:border-separate [&>table]:border-spacing-0">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    Symbol
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    Market Cap (B)
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    P/E
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    P/B
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    ROE (%)
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    ROA (%)
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    Net Margin (%)
                                </TableHeaderCell>
                                <TableHeaderCell className="sticky top-0 z-10 border-b border-tremor-border bg-white text-right text-tremor-content-strong dark:border-dark-tremor-border dark:bg-gray-900 dark:text-dark-tremor-content-strong">
                                    Growth (%)
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {peers.map((item) => (
                                <TableRow key={item.symbol} className={cx(
                                    item.isCurrent ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                                )}>
                                    <TableCell className="border-b border-tremor-border dark:border-dark-tremor-border">
                                        <div className="flex flex-col">
                                            <span className={cx(
                                                "font-bold text-tremor-default",
                                                item.isCurrent ? "text-blue-600 dark:text-blue-400" : "text-tremor-content-strong dark:text-dark-tremor-content-strong"
                                            )}>
                                                {item.symbol}
                                                {item.isCurrent && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full dark:bg-blue-800 dark:text-blue-200 uppercase">Current</span>}
                                            </span>
                                            <span className="text-xs text-tremor-content-subtle truncate max-w-[150px]">{item.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis border-b border-tremor-border dark:border-dark-tremor-border">
                                        {item.marketCap ? `${formatNumber(item.marketCap / 1e9)}B` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right border-b border-tremor-border dark:border-dark-tremor-border">
                                        <span className={cx(
                                            "font-medium",
                                            item.pe && medianPe && item.pe < medianPe ? "text-emerald-600 dark:text-emerald-400" : "text-tremor-content-strong dark:text-dark-tremor-content-strong"
                                        )}>
                                            {item.pe ? item.pe.toFixed(2) : '-'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-medium border-b border-tremor-border dark:border-dark-tremor-border text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                        {item.pb ? item.pb.toFixed(2) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right border-b border-tremor-border dark:border-dark-tremor-border">
                                        <span className={cx(
                                            "font-medium",
                                            item.roe && (item.roe > 0.15 || item.roe > 15) ? "text-emerald-600 dark:text-emerald-400" : "text-tremor-content-strong dark:text-dark-tremor-content-strong"
                                        )}>
                                            {item.roe ? `${(item.roe * (Math.abs(item.roe) < 1 ? 100 : 1)).toFixed(1)}%` : '-'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right border-b border-tremor-border dark:border-dark-tremor-border text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                        {item.roa ? `${(item.roa * (Math.abs(item.roa) < 1 ? 100 : 1)).toFixed(1)}%` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right border-b border-tremor-border dark:border-dark-tremor-border text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                        {item.netMargin ? `${(item.netMargin * (Math.abs(item.netMargin) < 1 ? 100 : 1)).toFixed(1)}%` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right border-b border-tremor-border dark:border-dark-tremor-border">
                                        <span className={cx(
                                            "inline-flex items-center rounded-tremor-small px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                                            (item.profitGrowth || 0) > 0
                                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20"
                                                : (item.profitGrowth || 0) < 0
                                                    ? "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-400 dark:ring-rose-400/20"
                                                    : "bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20"
                                        )}>
                                            {item.profitGrowth ? `${(item.profitGrowth * (Math.abs(item.profitGrowth) < 1 ? 100 : 1)).toFixed(1)}%` : '0%'}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
};

export default AnalysisTab;
