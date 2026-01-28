'use client';

import { Card, SparkAreaChart } from '@tremor/react';
import { cx } from '@/lib/utils';

interface IndexCardProps {
    id: string;
    name: string;
    value: number;
    change: number;
    percentChange: number;
    chartData?: number[];
    isLoading?: boolean;
}

export default function IndexCard({
    id,
    name,
    value,
    change,
    percentChange,
    chartData = [],
    isLoading = false,
}: IndexCardProps) {
    const isUp = change >= 0;
    const changeType = isUp ? 'positive' : 'negative';

    const baseValue = chartData.length > 0 ? chartData[0] : 0;
    const sparkData = chartData.map((v, i) => ({
        index: i,
        Value: baseValue ? ((v - baseValue) / baseValue) * 100 : 0,
    }));

    if (isLoading) {
        return (
            <Card className="p-3 md:p-6">
                <div className="space-y-3">
                    <div className="h-4 w-1/2 rounded bg-tremor-background-muted" />
                    <div className="h-7 w-2/3 rounded bg-tremor-background-muted" />
                    <div className="h-3 w-1/3 rounded bg-tremor-background-muted" />
                    <div className="h-10 w-full rounded bg-tremor-background-muted" />
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-3 md:p-6">
            <dt className="text-xs md:text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong truncate">
                {name}
            </dt>
            <div className="mt-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
                <dd
                    className={
                        cx(
                            "font-semibold tracking-tight",
                            changeType === 'positive' ? 'text-emerald-700 dark:text-emerald-500' : 'text-red-700 dark:text-red-500',
                            "text-base md:text-tremor-title"
                        )
                    }
                >
                    {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </dd>
                <dd className="flex items-center space-x-1 text-[10px] md:text-tremor-default">
                    <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                        {isUp ? '+' : ''}{change.toFixed(2)}
                    </span>
                    <span className={changeType === 'positive' ? 'text-emerald-700 dark:text-emerald-500' : 'text-red-700 dark:text-red-500'}>
                        ({isUp ? '+' : ''}{percentChange.toFixed(2)}%)
                    </span>
                </dd>
            </div>
            {sparkData.length > 0 && (
                <SparkAreaChart
                    data={sparkData}
                    index="index"
                    categories={["Value"]}
                    showGradient={false}
                    colors={changeType === 'positive' ? ['emerald'] : ['red']}
                    className="mt-2 md:mt-4 h-8 md:h-10 w-full"
                />
            )}
        </Card>
    );
}
