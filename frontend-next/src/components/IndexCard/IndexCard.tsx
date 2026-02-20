'use client';

import { Card } from '@tremor/react';
import { cx } from '@/lib/utils';
import React, { useState } from 'react';
import { RiHistoryLine } from '@remixicon/react';
import IndexHistoryModal from './IndexHistoryModal';

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
    const [isModalOpen, setIsModalOpen] = useState(false);

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
        <>
            <Card
                className="group p-3 md:p-4 cursor-pointer hover:bg-tremor-background-subtle dark:hover:bg-dark-tremor-background-muted transition-colors"
                onClick={() => setIsModalOpen(true)}
            >
                {/* Header: name + price */}
                <div className="flex items-start justify-between gap-2">
                    <dt className="text-xs md:text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong truncate flex items-center gap-1.5 group-hover:text-tremor-brand transition-colors">
                        {name}
                        <RiHistoryLine className="w-3.5 h-3.5 text-tremor-content-subtle group-hover:text-tremor-brand" />
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

                {/* KL & GT + Breadth (Compact) */}
                <div className="mt-2 pt-2 border-t border-tremor-border dark:border-dark-tremor-border">
                    {/* KL & GT */}
                    {(totalShares > 0 || totalValue > 0) && (
                        <div className="text-[11px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle font-medium">
                            <span className="text-tremor-content dark:text-dark-tremor-content">KL: {totalShares.toLocaleString('en-US')}</span>
                            <span className="mx-1.5">•</span>
                            <span className="text-tremor-content dark:text-dark-tremor-content">GT: {formatValue(totalValue)}</span>
                        </div>
                    )}

                    {/* Breadth: Tăng(Trần) ◾ Đứng ↙ Giảm(Sàn) */}
                    <div className="mt-1 flex items-center text-[11px] font-bold gap-3">
                        <div className="flex items-center text-emerald-500">
                            ↗ {advances}
                            <span className="text-violet-500 ml-0.5">({ceilings})</span>
                        </div>
                        <div className="flex items-center text-amber-500">
                            ◾ {noChanges}
                        </div>
                        <div className="flex items-center text-red-500">
                            ↙ {declines}
                            <span className="text-cyan-500 ml-0.5">({floors})</span>
                        </div>
                    </div>
                </div>
            </Card>

            {isModalOpen && (
                <IndexHistoryModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    indexId={id}
                    indexName={name}
                />
            )}
        </>
    );
});
