'use client';

import { useState, useEffect } from 'react';
import {
    Card,
} from '@tremor/react';
import { RiTicketLine, RiHistoryLine, RiMapPin2Line } from '@remixicon/react';
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
        <Card className="mt-4 p-0 overflow-hidden bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm rounded-2xl">
            {/* Tabs */}
            <div className="p-1.5 bg-gray-50 dark:bg-gray-800/50 flex gap-1">
                {REGIONS.map((r) => (
                    <button
                        key={r.key}
                        onClick={() => setRegion(r.key as any)}
                        className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${region === r.key
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="p-5">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-rose-500 border-t-transparent" />
                    </div>
                ) : data ? (
                    <div className="space-y-4">
                        {/* Title Section */}
                        <div className="flex items-center justify-center gap-2 pb-4 border-b border-dashed border-gray-100 dark:border-gray-800">
                            <RiHistoryLine className="w-4 h-4 text-rose-500" />
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-tight">
                                {data.title || 'Lottery Results'}
                            </span>
                        </div>

                        {region === 'mb' && data.results && (
                            <div className="space-y-3">
                                {/* Special Prize (Prominent) */}
                                <div className="text-center p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                                    <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wide">
                                        {prizeLabels['DB']}
                                    </div>
                                    <div className="text-4xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-mono">
                                        {Array.isArray(data.results.DB) ? data.results.DB.join(' - ') : data.results.DB}
                                    </div>
                                </div>

                                {/* Prize Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {northernPrizes.filter(k => k !== 'DB').slice(0, 4).map((key) => {
                                        const prizes = data.results![key as keyof typeof data.results];
                                        if (!prizes || !Array.isArray(prizes)) return null;
                                        return (
                                            <div key={key} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800/50">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">{prizeLabels[key]}</span>
                                                <span className="text-base font-bold text-gray-700 dark:text-gray-200 font-mono truncate">
                                                    {prizes.join(' - ')}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="text-center text-xs text-gray-400 italic mt-2 opacity-60">
                                    ...and more prizes
                                </div>
                            </div>
                        )}

                        {(region === 'mn' || region === 'mt') && data.results?.provinces && (
                            <div className="space-y-5">
                                {data.results.provinces.slice(0, 1).map((province: any, idx: number) => (
                                    <div key={idx} className="space-y-3">
                                        <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-gray-100 justify-center">
                                            <RiMapPin2Line className="w-4 h-4 text-rose-500" />
                                            {province.name}
                                        </div>

                                        <div className="text-center p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                                            <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wide">
                                                {prizeLabels['DB']}
                                            </div>
                                            <div className="text-4xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-mono">
                                                {province.prizes.DB.join(' - ')}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.entries(province.prizes).slice(1, 5).map(([key, values]: any) => (
                                                <div key={key} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800/50">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">{prizeLabels[key] || key}</span>
                                                    <span className="text-base font-bold text-gray-700 dark:text-gray-200 font-mono truncate">
                                                        {values.join(' - ')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <div className="text-center text-xs text-gray-400 italic mt-2 opacity-60">
                                    ...and more prizes
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-12 text-center text-gray-400 text-sm">
                        No results found for {region.toUpperCase()}.
                    </div>
                )}
            </div>
        </Card>
    );
}
