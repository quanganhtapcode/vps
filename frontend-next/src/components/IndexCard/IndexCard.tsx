'use client';

import { Card } from '@tremor/react';
import { cx } from '@/lib/utils';
import React from 'react';

interface IndexCardProps {
    id: string;
    name: string;
    value: number;
    change: number;
    percentChange: number;
    chartData?: number[];
    advances?: number;
    declines?: number;
    noChanges?: number;
    ceilings?: number;
    floors?: number;
    totalShares?: number;
    totalValue?: number;
    isLoading?: boolean;
}

function formatShares(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' Tr';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + ' N';
    return n.toString();
}

function formatValue(n: number): string {
    // API returns value in unit that when divided by 1000 gives Tỷ
    // e.g. 460960.81 → 460.96 Tỷ
    const ty = n / 1000;
    if (ty >= 1000) return (ty / 1000).toFixed(2) + ' Nghìn Tỷ';
    return ty.toFixed(2) + ' Tỷ';
}

export default React.memo(function IndexCard({
    id,
    name,
    value,
    change,
    percentChange,
    chartData = [],
    advances = 0,
    declines = 0,
    noChanges = 0,
    ceilings = 0,
    floors = 0,
    totalShares = 0,
    totalValue = 0,
    isLoading = false,
}: IndexCardProps) {
    const isUp = change >= 0;
    const changeType = isUp ? 'positive' : 'negative';

    if (isLoading) {
        return (
            <Card className="p-3 md:p-4">
                <div className="animate-pulse">
                    {/* Header row: name visible immediately + price placeholder */}
                    <div className="flex items-start justify-between gap-2">
                        <span className="text-xs md:text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                            {name || <span className="block h-4 w-24 rounded bg-tremor-background-muted" />}
                        </span>
                        <div className="h-5 w-20 rounded bg-tremor-background-muted" />
                    </div>
                    {/* Subtitle row */}
                    <div className="mt-1 flex items-center justify-between">
                        <div className="h-3 w-16 rounded bg-tremor-background-muted/60" />
                        <div className="h-3 w-24 rounded bg-tremor-background-muted/60" />
                    </div>
                    {/* KL/GT row */}
                    <div className="mt-2 h-3 w-40 rounded bg-tremor-background-muted/60" />
                    {/* Breadth row */}
                    <div className="mt-3 border-t border-tremor-border dark:border-dark-tremor-border pt-2">
                        <div className="h-4 w-36 rounded bg-tremor-background-muted/60" />
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-3 md:p-4">
            {/* Header: name + price */}
            <div className="flex items-start justify-between gap-2">
                <dt className="text-xs md:text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong truncate">
                    {name}
                </dt>
                <dd
                    className={cx(
                        'font-bold tracking-tight text-sm md:text-base whitespace-nowrap',
                        changeType === 'positive' ? 'text-emerald-500' : 'text-red-500',
                    )}
                >
                    {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </dd>
            </div>

            {/* Subtitle: Đóng cửa + change */}
            <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[10px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                    ● Đóng cửa
                </span>
                <dd className={cx(
                    'text-[11px] md:text-xs font-medium',
                    changeType === 'positive' ? 'text-emerald-500' : 'text-red-500'
                )}>
                    {isUp ? '+' : ''}{change.toFixed(2)}({isUp ? '+' : ''}{percentChange.toFixed(2)}%)
                </dd>
            </div>

            {/* KL & GT */}
            {(totalShares > 0 || totalValue > 0) && (
                <div className="mt-2 text-[10px] md:text-[11px] text-tremor-content dark:text-dark-tremor-content">
                    <span className="font-medium">KL:</span>{' '}
                    <span>{totalShares.toLocaleString('en-US')}</span>
                    <span className="mx-1 text-tremor-content-subtle">•</span>
                    <span className="font-medium">GT:</span>{' '}
                    <span>{formatValue(totalValue)}</span>
                </div>
            )}

            {/* Breadth: Trần / Tăng / TC / Giảm / Sàn */}
            <div className="mt-2 flex items-center gap-1 text-[10px] md:text-[11px] font-medium border-t border-tremor-border dark:border-dark-tremor-border pt-2">
                <span className="text-violet-500">↑{ceilings}</span>
                <span className="text-[8px] text-tremor-content-subtle">(Tr)</span>
                <span className="text-emerald-500 ml-1">↑{advances}</span>
                <span className="text-amber-500 mx-1">●{noChanges}</span>
                <span className="text-red-500">↓{declines}</span>
                <span className="text-[8px] text-tremor-content-subtle ml-0.5">(S</span>
                <span className="text-cyan-500">{floors}</span>
                <span className="text-[8px] text-tremor-content-subtle">)</span>
            </div>
        </Card>
    );
});
