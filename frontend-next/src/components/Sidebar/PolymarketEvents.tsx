'use client';

import { useState, useEffect } from 'react';
import { RiArrowDownSLine, RiArrowUpSLine, RiExternalLinkLine } from '@remixicon/react';

interface PolyEvent {
    id: string;
    question: string;
    slug: string;
    yesPrice: number;
    volume: number;
    url: string;
}

async function fetchEconomicEvents(): Promise<PolyEvent[]> {
    const res = await fetch('/api/polymarket/events', { cache: 'no-store' });
    if (!res.ok) throw new Error('Polymarket proxy fetch failed');

    const data: Array<{ id: string; question: string; slug: string; yesPrice: number; volume: number }> = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item) => ({
        id: item.id,
        question: item.question,
        slug: item.slug,
        yesPrice: item.yesPrice,
        volume: item.volume,
        url: `https://polymarket.com/event/${item.slug || item.id}`,
    }));
}

function formatVolume(vol: number): string {
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
}

export default function PolymarketEvents() {
    const [open, setOpen] = useState(true);
    const [events, setEvents] = useState<PolyEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetchEconomicEvents()
            .then((ev) => { setEvents(ev); setError(false); })
            .catch(() => setError(true))
            .finally(() => setIsLoading(false));

        const id = setInterval(() => {
            fetchEconomicEvents()
                .then((ev) => { setEvents(ev); setError(false); })
                .catch(() => {});
        }, 5 * 60 * 1000);

        return () => clearInterval(id);
    }, []);

    return (
        <div className="mt-4">
            {/* Header */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-1 pb-2"
            >
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    📊 Polymarket Kinh tế
                </span>
                {open
                    ? <RiArrowUpSLine className="w-4 h-4 text-gray-400" />
                    : <RiArrowDownSLine className="w-4 h-4 text-gray-400" />
                }
            </button>

            {open && (
                <div className="space-y-2">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500" />
                        </div>
                    ) : error || events.length === 0 ? (
                        <p className="text-center py-4 text-xs text-gray-400 italic">
                            Không tải được sự kiện
                        </p>
                    ) : (
                        events.map((ev) => {
                            const yesPct = Math.round(ev.yesPrice * 100);
                            const noPct = 100 - yesPct;
                            const barColor = yesPct >= 60
                                ? 'bg-green-500'
                                : yesPct <= 40
                                    ? 'bg-red-400'
                                    : 'bg-yellow-400';

                            return (
                                <a
                                    key={ev.id}
                                    href={ev.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                                >
                                    {/* Question */}
                                    <div className="flex items-start justify-between gap-2 mb-2.5">
                                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-snug line-clamp-2">
                                            {ev.question}
                                        </p>
                                        <RiExternalLinkLine className="w-3.5 h-3.5 shrink-0 text-gray-400 mt-0.5" />
                                    </div>

                                    {/* Yes / No labels */}
                                    <div className="flex justify-between text-[11px] font-bold mb-1">
                                        <span className="text-green-500">Yes {yesPct}%</span>
                                        <span className="text-red-400">No {noPct}%</span>
                                    </div>

                                    {/* Probability bar */}
                                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${barColor} rounded-full transition-all duration-500`}
                                            style={{ width: `${yesPct}%` }}
                                        />
                                    </div>

                                    {/* Volume */}
                                    <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                                        Vol: {formatVolume(ev.volume)}
                                    </p>
                                </a>
                            );
                        })
                    )}

                    <div className="text-center pt-0.5 pb-1">
                        <a
                            href="https://polymarket.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            Powered by Polymarket →
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
