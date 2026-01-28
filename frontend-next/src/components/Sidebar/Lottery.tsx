'use client';

import { useState, useEffect } from 'react';
import {
    Card,
} from '@tremor/react';
import { RiTicketLine, RiHistoryLine, RiMapPin2Line, RiFireFill, RiStarFill } from '@remixicon/react';
import { fetchLottery, LotteryResult } from '@/lib/api';

const REGIONS = [
    { key: 'mb', label: 'North' },
    { key: 'mn', label: 'South' },
    { key: 'mt', label: 'Central' },
] as const;

const prizeLabels: Record<string, string> = {
    'DB': 'Special Prize',
    'G1': '1st',
    'G2': '2nd',
    'G3': '3rd',
    'G4': '4th',
    'G5': '5th',
    'G6': '6th',
    'G7': '7th',
    'G8': '8th',
};

export default function Lottery() {
    const [region, setRegion] = useState<'mb' | 'mn' | 'mt'>('mb');
    const [data, setData] = useState<LotteryResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            try {
                const res = await fetchLottery(region);
                setData(res);
            } catch (error) {
                console.error('Error loading lottery:', error);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [region]);

    const northernPrizes = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

    return (
        <Card className="mt-4 p-0 overflow-hidden bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800/60 shadow-xl rounded-2xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-950">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-50 dark:bg-rose-500/10 rounded-lg">
                        <RiTicketLine className="w-4 h-4 text-rose-500" />
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">Lottery Results</span>
                </div>
                {data?.pubDate && (
                    <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">{data.pubDate}</span>
                )}
            </div>

            {/* Region Selectors */}
            <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800 flex gap-1.5">
                {REGIONS.map((r) => (
                    <button
                        key={r.key}
                        onClick={() => setRegion(r.key as any)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 ${region === r.key
                            ? 'bg-white dark:bg-gray-800 text-rose-500 dark:text-rose-400 shadow-md ring-1 ring-black/5 dark:ring-white/10'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            <div className="p-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                        <div className="relative">
                            <div className="h-8 w-8 rounded-full border-2 border-rose-500/20" />
                            <div className="absolute top-0 h-8 w-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                        </div>
                    </div>
                ) : data ? (
                    <div className="space-y-4">
                        {/* Title Section (Optional) */}
                        <div className="flex items-center justify-center text-center px-2">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase leading-relaxed max-w-[240px]">
                                {data.title?.replace('Kết quả xổ số', '').trim() || 'Daily Results'}
                            </span>
                        </div>

                        {/* North Region (MB) */}
                        {region === 'mb' && data.results && (
                            <div className="space-y-3">
                                {/* Special Prize */}
                                <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/20">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Special Prize</span>
                                        <RiFireFill className="w-3 h-3 text-rose-200 animate-pulse" />
                                    </div>
                                    <div className="text-4xl font-black tracking-tighter text-center py-1 drop-shadow-md">
                                        {Array.isArray(data.results.DB) ? data.results.DB.join(' - ') : data.results.DB}
                                    </div>
                                    <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12">
                                        <RiTicketLine className="w-20 h-20" />
                                    </div>
                                </div>

                                {/* Prize Grid */}
                                <div className="grid grid-cols-2 gap-2">
                                    {northernPrizes.filter(k => k !== 'DB').map((key) => {
                                        const prizes = data.results![key as keyof typeof data.results];
                                        if (!prizes || !Array.isArray(prizes)) return null;
                                        // Ensure we don't try to render the provinces array
                                        if (key === 'provinces') return null;

                                        const isHighTier = ['G1', 'G2', 'G3'].includes(key);

                                        return (
                                            <div
                                                key={key}
                                                className={`flex flex-col p-2.5 rounded-xl border transition-colors ${isHighTier
                                                    ? 'bg-amber-50/30 dark:bg-amber-500/5 border-amber-100 dark:border-amber-900/30'
                                                    : 'bg-gray-50/50 dark:bg-white/5 border-gray-100 dark:border-gray-800/50'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isHighTier ? 'text-amber-500' : 'text-gray-400'
                                                        }`}>{prizeLabels[key]}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 leading-tight">
                                                    {(prizes as string[]).map((p, idx) => (
                                                        <span key={idx} className={`font-bold tracking-tight text-xs ${isHighTier ? 'text-gray-900 dark:text-amber-100' : 'text-gray-600 dark:text-gray-300'
                                                            }`}>
                                                            {p}{idx < prizes.length - 1 ? ',' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* South & Central Region (MN/MT) */}
                        {(region === 'mn' || region === 'mt') && data.results?.provinces && (
                            <div className="space-y-6">
                                {data.results.provinces.map((province: any, idx: number) => (
                                    <div key={idx} className="space-y-3 pb-4 last:pb-0 border-b last:border-0 border-gray-100 dark:border-gray-800/60">
                                        <div className="flex items-center gap-2 text-xs font-black text-gray-900 dark:text-gray-100 justify-center">
                                            <div className="h-1 w-6 rounded-full bg-rose-500/20" />
                                            {province.name}
                                            <div className="h-1 w-6 rounded-full bg-rose-500/20" />
                                        </div>

                                        {/* Special Prize */}
                                        <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Special Prize</span>
                                                <RiStarFill className="w-3 h-3 text-indigo-200 animate-pulse" />
                                            </div>
                                            <div className="text-4xl font-black tracking-tighter text-center py-1 drop-shadow-md">
                                                {province.prizes.DB.join(' - ')}
                                            </div>
                                        </div>

                                        {/* Main Prizes Grid */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(province.prizes)
                                                .filter(([key]) => key !== 'DB')
                                                .map(([key, values]: any) => (
                                                    <div
                                                        key={key}
                                                        className="flex flex-col p-2.5 rounded-xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-gray-800/50"
                                                    >
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase mb-1">{prizeLabels[key] || key}</span>
                                                        <div className="flex flex-wrap gap-1 leading-tight">
                                                            {values.map((v: string, vIdx: number) => (
                                                                <span key={vIdx} className="font-bold tracking-tight text-[11px] text-gray-600 dark:text-gray-300">
                                                                    {v}{vIdx < values.length - 1 ? ',' : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-16 text-center space-y-2">
                        <RiTicketLine className="w-8 h-8 text-gray-200 dark:text-gray-800 mx-auto" />
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                            No results found for {region.toUpperCase()}.
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
}

