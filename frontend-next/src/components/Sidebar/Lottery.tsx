'use client';

import { useState, useEffect } from 'react';
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react';
import { fetchLottery, LotteryResult } from '@/lib/api';

const REGIONS = [
    { key: 'mb', label: 'Bắc' },
    { key: 'mt', label: 'Trung' },
    { key: 'mn', label: 'Nam' },
] as const;

const prizeLabels: Record<string, string> = {
    'DB': 'G.ĐB', 'G1': 'G.1', 'G2': 'G.2', 'G3': 'G.3',
    'G4': 'G.4', 'G5': 'G.5', 'G6': 'G.6', 'G7': 'G.7', 'G8': 'G.8',
};

const NORTHERN_PRIZES = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
const SOUTHERN_PRIZES = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];

export default function Lottery() {
    const [open, setOpen] = useState(true);
    const [region, setRegion] = useState<'mb' | 'mn' | 'mt'>('mb');
    const [data, setData] = useState<LotteryResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [provIndex, setProvIndex] = useState(0);

    useEffect(() => {
        setProvIndex(0);
        setIsLoading(true);
        fetchLottery(region)
            .then(setData)
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [region]);

    return (
        <div className="mt-4">
            {/* Header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-1 pb-2"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">🎰 Xổ số</span>
                    {data?.pubDate && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">{data.pubDate}</span>
                    )}
                </div>
                {open
                    ? <RiArrowUpSLine className="w-4 h-4 text-gray-400" />
                    : <RiArrowDownSLine className="w-4 h-4 text-gray-400" />
                }
            </button>

            {open && (
                <div className="space-y-2">
                    {/* Region tabs */}
                    <div className="flex gap-1">
                        {REGIONS.map((r) => (
                            <button
                                key={r.key}
                                onClick={() => setRegion(r.key as 'mb' | 'mn' | 'mt')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    region === r.key
                                        ? 'bg-rose-500 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-100'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-rose-500" />
                        </div>
                    ) : data ? (
                        <>
                            {/* Northern (MB) — flat list */}
                            {region === 'mb' && data.results && (
                                <div className="space-y-0.5">
                                    {NORTHERN_PRIZES.map((key) => {
                                        const prizes = data.results[key as keyof typeof data.results];
                                        if (!prizes || !Array.isArray(prizes)) return null;
                                        const isDB = key === 'DB';
                                        return (
                                            <div
                                                key={key}
                                                className={`flex items-start gap-2 px-2 py-1 rounded-lg ${isDB ? 'bg-rose-50 dark:bg-rose-500/10' : ''}`}
                                            >
                                                <span className="w-8 shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-500 pt-0.5">
                                                    {prizeLabels[key]}
                                                </span>
                                                <div className={`flex flex-wrap gap-x-2 gap-y-0.5 leading-tight ${
                                                    isDB
                                                        ? 'text-base font-extrabold text-rose-500'
                                                        : 'text-xs font-semibold text-gray-700 dark:text-gray-200'
                                                }`}>
                                                    {prizes.map((p, i) => (
                                                        <span key={i}>{typeof p === 'string' ? p : String(p)}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Central / Southern (MT/MN) — province tabs + flat list */}
                            {(region === 'mn' || region === 'mt') && data.results?.provinces && (
                                <div className="space-y-2">
                                    {data.results.provinces.length > 1 && (
                                        <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                                            {data.results.provinces.map((prov, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setProvIndex(i)}
                                                    className={`shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                                                        provIndex === i
                                                            ? 'bg-rose-500 text-white'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-100'
                                                    }`}
                                                >
                                                    {prov.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {data.results.provinces[provIndex] && (
                                        <div className="space-y-0.5">
                                            {SOUTHERN_PRIZES.map((key) => {
                                                const prizes = data.results.provinces![provIndex].prizes[key];
                                                if (!prizes?.length) return null;
                                                const isDB = key === 'DB';
                                                return (
                                                    <div
                                                        key={key}
                                                        className={`flex items-start gap-2 px-2 py-1 rounded-lg ${isDB ? 'bg-rose-50 dark:bg-rose-500/10' : ''}`}
                                                    >
                                                        <span className="w-8 shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-500 pt-0.5">
                                                            {prizeLabels[key]}
                                                        </span>
                                                        <div className={`flex flex-wrap gap-x-2 gap-y-0.5 leading-tight ${
                                                            isDB
                                                                ? 'text-base font-extrabold text-rose-500'
                                                                : 'text-xs font-semibold text-gray-700 dark:text-gray-200'
                                                        }`}>
                                                            {prizes.map((p, i) => (
                                                                <span key={i}>{p}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-center py-6 text-xs text-gray-400 italic">
                            Không tìm thấy kết quả
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
