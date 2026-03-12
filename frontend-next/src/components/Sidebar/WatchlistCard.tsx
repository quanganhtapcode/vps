'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RiStarFill, RiEqualizerLine, RiCloseLine, RiCheckLine, RiArrowRightSLine } from '@remixicon/react';
import { useWatchlist } from '@/lib/watchlistContext';
import { formatNumber } from '@/lib/api';
import { getTickerData } from '@/lib/tickerCache';
import { siteConfig } from '@/app/siteConfig';

interface WatchItem {
    symbol: string;
    name: string;
    exchange: string;
    price: number;
    changePercent: number;
    loading: boolean;
}

export default function WatchlistCard() {
    const { watchlist, removeSymbol } = useWatchlist();
    const [items, setItems] = useState<WatchItem[]>([]);
    const [editMode, setEditMode] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    // Fetch ticker metadata once
    const enrichWithMeta = useCallback(async (symbols: string[]) => {
        const td = await getTickerData();
        return symbols.map(sym => {
            const t = td?.tickers?.find((t: { symbol: string }) => t.symbol.toUpperCase() === sym);
            return {
                symbol: sym,
                name: t?.name || sym,
                exchange: t?.exchange || '',
            };
        });
    }, []);

    useEffect(() => {
        if (watchlist.length === 0) {
            setItems([]);
            return;
        }

        // Seed items with meta, keep existing price data
        enrichWithMeta(watchlist).then(metas => {
            setItems(prev => {
                const existingMap = new Map(prev.map(i => [i.symbol, i]));
                return metas.map(m => ({
                    ...m,
                    price: existingMap.get(m.symbol)?.price ?? 0,
                    changePercent: existingMap.get(m.symbol)?.changePercent ?? 0,
                    loading: existingMap.get(m.symbol) ? existingMap.get(m.symbol)!.loading : true,
                }));
            });
        });

        const controllers: AbortController[] = [];

        watchlist.forEach(symbol => {
            const ctrl = new AbortController();
            controllers.push(ctrl);
            fetch(`/api/current-price/${symbol}`, { signal: ctrl.signal })
                .then(r => r.ok ? r.json() : null)
                .then(res => {
                    if (!res || !res.success) return;
                    let price = res.current_price || 0;
                    if (price > 0 && price < 500) price *= 1000;
                    const pct = res.price_change_percent || 0;
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
    }, [watchlist, enrichWithMeta]);

    if (watchlist.length === 0) return null;

    return (
        <div className="rounded-tremor-default border border-tremor-border bg-tremor-background dark:border-dark-tremor-border dark:bg-dark-tremor-background overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-1 px-4 py-3">
                <button
                    type="button"
                    onClick={() => setCollapsed(v => !v)}
                    className="flex items-center gap-1 flex-1 min-w-0 text-left"
                >
                    <span className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                        Watchlist
                    </span>
                    <RiArrowRightSLine
                        className={`h-4 w-4 text-tremor-content dark:text-dark-tremor-content transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
                    />
                </button>
                <button
                    type="button"
                    onClick={() => setEditMode(v => !v)}
                    title={editMode ? 'Xong' : 'Chỉnh sửa'}
                    className="p-1.5 rounded-md text-tremor-content hover:text-tremor-content-strong hover:bg-tremor-background-muted dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-strong dark:hover:bg-dark-tremor-background-muted transition-colors"
                >
                    {editMode
                        ? <RiCheckLine className="h-4 w-4 text-tremor-brand dark:text-dark-tremor-brand" />
                        : <RiEqualizerLine className="h-4 w-4" />
                    }
                </button>
            </div>

            {/* List */}
            {!collapsed && (
                <div className="divide-y divide-tremor-border dark:divide-dark-tremor-border">
                    {items.map(item => (
                        <div key={item.symbol} className="flex items-center gap-2 px-4 py-2.5">
                            {/* Edit mode: star/remove button */}
                            {editMode && (
                                <button
                                    type="button"
                                    onClick={() => removeSymbol(item.symbol)}
                                    className="flex-shrink-0 p-0.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                                    title={`Xoá ${item.symbol}`}
                                >
                                    <RiCloseLine className="h-3.5 w-3.5 text-white" />
                                </button>
                            )}

                            {/* Logo */}
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-tremor-border dark:border-dark-tremor-border overflow-hidden flex items-center justify-center">
                                <img
                                    src={siteConfig.stockLogoUrl(item.symbol)}
                                    alt={item.symbol}
                                    className="w-full h-full object-contain p-0.5"
                                    onError={e => {
                                        const t = e.target as HTMLImageElement;
                                        t.style.display = 'none';
                                        const fb = t.nextElementSibling as HTMLElement | null;
                                        if (fb) fb.style.display = 'flex';
                                    }}
                                />
                                <span
                                    className="hidden w-full h-full items-center justify-center text-[9px] font-bold text-tremor-content dark:text-dark-tremor-content"
                                    style={{ display: 'none' }}
                                >
                                    {item.symbol.slice(0, 2)}
                                </span>
                            </div>

                            {/* Name + sub */}
                            <Link
                                href={`/stock/${item.symbol}`}
                                className="flex-1 min-w-0 hover:opacity-75 transition-opacity"
                            >
                                <div className="text-sm font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong truncate leading-tight">
                                    {item.name}
                                </div>
                                <div className="text-xs text-tremor-content dark:text-dark-tremor-content">
                                    {item.symbol}{item.exchange ? ` · ${item.exchange}` : ''}
                                </div>
                            </Link>

                            {/* Price + change */}
                            <div className="flex-shrink-0 text-right">
                                {item.loading ? (
                                    <div className="space-y-1">
                                        <div className="h-3 w-14 bg-tremor-background-muted dark:bg-dark-tremor-background-muted rounded animate-pulse" />
                                        <div className="h-2.5 w-10 bg-tremor-background-muted dark:bg-dark-tremor-background-muted rounded animate-pulse ml-auto" />
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong tabular-nums">
                                            {item.price > 0 ? formatNumber(item.price) : '--'}
                                        </div>
                                        <div className={`text-xs font-medium tabular-nums ${item.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                            {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
