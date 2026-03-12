'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RiStarFill, RiDeleteBin6Line } from '@remixicon/react';
import { useWatchlist } from '@/lib/watchlistContext';
import { formatNumber } from '@/lib/api';

interface WatchItem {
    symbol: string;
    price: number;
    changePercent: number;
    loading: boolean;
}

export default function WatchlistCard() {
    const { watchlist, removeSymbol } = useWatchlist();
    const [items, setItems] = useState<WatchItem[]>([]);

    useEffect(() => {
        if (watchlist.length === 0) {
            setItems([]);
            return;
        }

        // Merge: keep existing data for symbols already loaded
        setItems(prev => {
            const existing = new Map(prev.map(i => [i.symbol, i]));
            return watchlist.map(sym => existing.get(sym) || {
                symbol: sym,
                price: 0,
                changePercent: 0,
                loading: true,
            });
        });

        const controllers: AbortController[] = [];

        watchlist.forEach(symbol => {
            const ctrl = new AbortController();
            controllers.push(ctrl);
            fetch(`/api/stock/${symbol}`, { signal: ctrl.signal })
                .then(r => r.ok ? r.json() : null)
                .then(res => {
                    if (!res) return;
                    const data = res.data || res;
                    let price = data.current_price || data.price || 0;
                    if (price > 0 && price < 500) price *= 1000;
                    const pct = data.price_change_percent || data.changePercent || data.pctChange || 0;
                    setItems(prev => prev.map(i =>
                        i.symbol === symbol ? { ...i, price, changePercent: pct, loading: false } : i
                    ));
                })
                .catch(() => {
                    setItems(prev => prev.map(i =>
                        i.symbol === symbol ? { ...i, loading: false } : i
                    ));
                });
        });

        return () => controllers.forEach(c => c.abort());
    }, [watchlist]);

    if (watchlist.length === 0) return null;

    return (
        <div className="rounded-tremor-default border border-tremor-border bg-tremor-background p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background">
            <div className="flex items-center gap-2 mb-3">
                <RiStarFill className="h-4 w-4 text-amber-400" />
                <span className="text-tremor-default font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                    Watchlist
                </span>
                <span className="ml-auto text-xs text-tremor-content dark:text-dark-tremor-content bg-tremor-background-muted dark:bg-dark-tremor-background-muted rounded-full px-2 py-0.5">
                    {watchlist.length}
                </span>
            </div>

            <div className="divide-y divide-tremor-border dark:divide-dark-tremor-border">
                {items.map(item => (
                    <div
                        key={item.symbol}
                        className="flex items-center gap-2 py-2 group"
                    >
                        <Link
                            href={`/stock/${item.symbol}`}
                            className="flex-1 flex items-center justify-between gap-2 min-w-0 hover:opacity-80 transition-opacity"
                        >
                            <span className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                {item.symbol}
                            </span>
                            {item.loading ? (
                                <div className="h-3 w-20 bg-tremor-background-muted dark:bg-dark-tremor-background-muted rounded animate-pulse" />
                            ) : (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong tabular-nums">
                                        {item.price > 0 ? formatNumber(item.price) : '--'}
                                    </span>
                                    <span className={`tabular-nums font-medium ${item.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                    </span>
                                </div>
                            )}
                        </Link>
                        <button
                            type="button"
                            onClick={() => removeSymbol(item.symbol)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-tremor-content hover:text-red-500 dark:text-dark-tremor-content dark:hover:text-red-400"
                            title={`Xoá ${item.symbol} khỏi Watchlist`}
                        >
                            <RiDeleteBin6Line className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
