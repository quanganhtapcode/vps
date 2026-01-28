'use client';

import { useState, useEffect } from 'react';
import {
    Card,
} from '@tremor/react';
import { RiTicketLine, RiHistoryLine, RiMapPin2Line, RiFireFill, RiStarFill } from '@remixicon/react';
import { fetchLottery, LotteryResult } from '@/lib/api';
import React from 'react';

const REGIONS = [
    { key: 'mb', label: 'Miền Bắc' },
    { key: 'mt', label: 'Miền Trung' },
    { key: 'mn', label: 'Miền Nam' },
] as const;

const prizeLabels: Record<string, string> = {
    'DB': 'G.ĐB',
    'G1': 'G.1',
    'G2': 'G.2',
    'G3': 'G.3',
    'G4': 'G.4',
    'G5': 'G.5',
    'G6': 'G.6',
    'G7': 'G.7',
    'G8': 'G.8',
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
        <div className="mt-4 space-y-4">
            {/* Tabs Style */}
            <div className="flex p-1 bg-gray-100/80 dark:bg-gray-800/50 rounded-xl gap-1">
                {REGIONS.map((r) => (
                    <button
                        key={r.key}
                        onClick={() => setRegion(r.key as any)}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${region === r.key
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Loading / Content */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-rose-500" />
                </div>
            ) : data ? (
                <div className="space-y-4">
                    {/* For Northern Region (MB) */}
                    {region === 'mb' && data.results && (
                        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                            <div className="grid grid-cols-[80px_1fr] divide-x divide-y divide-gray-200 dark:divide-gray-700">
                                {northernPrizes.map((key) => {
                                    const prizes = data.results![key as keyof typeof data.results];
                                    if (!prizes || key === 'provinces') return null;
                                    const isDB = key === 'DB';
                                    const prizeArray = (Array.isArray(prizes) ? prizes : [prizes]) as string[];

                                    return (
                                        <React.Fragment key={key}>
                                            <div className="flex items-center justify-center bg-gray-50/50 dark:bg-gray-800/30 p-3 text-xs font-bold text-gray-600 dark:text-gray-400">
                                                {prizeLabels[key]}
                                            </div>
                                            <div className={`p-3 text-center flex flex-wrap justify-center gap-x-4 gap-y-2 font-bold ${isDB ? 'text-xl text-rose-500' : 'text-sm text-gray-700 dark:text-gray-200'
                                                }`}>
                                                {prizeArray.map((p, idx) => (
                                                    <span key={idx} className={key === 'G3' ? 'w-full py-0.5' : ''}>
                                                        {typeof p === 'string' ? p : String(p)}
                                                        {idx < prizeArray.length - 1 && key !== 'G3' ? ' - ' : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* For Central & Southern (MT/MN) */}
                    {(region === 'mn' || region === 'mt') && data.results?.provinces && (
                        <div className="space-y-6">
                            {data.results.provinces.map((province: any, idx: number) => (
                                <div key={idx} className="space-y-2">
                                    <div className="text-center text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-wider">
                                        {province.name}
                                    </div>
                                    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                                        <div className="grid grid-cols-[80px_1fr] divide-x divide-y divide-gray-200 dark:divide-gray-700">
                                            {Object.entries(province.prizes).map(([key, prizes]: any) => (
                                                <React.Fragment key={key}>
                                                    <div className="flex items-center justify-center bg-gray-50/50 dark:bg-gray-800/30 p-2.5 text-[11px] font-bold text-gray-600 dark:text-gray-400">
                                                        {prizeLabels[key] || key}
                                                    </div>
                                                    <div className={`p-2.5 text-center flex flex-wrap justify-center gap-x-3 gap-y-1 font-bold ${key === 'DB' ? 'text-lg text-rose-500' : 'text-sm text-gray-700 dark:text-gray-200'
                                                        }`}>
                                                        {prizes.map((p: string, pIdx: number) => (
                                                            <span key={pIdx}>
                                                                {p}{pIdx < prizes.length - 1 ? ' - ' : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Date Footer */}
                    <div className="text-center py-1">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                            Kết quả ngày: {data.pubDate || new Date().toLocaleDateString('vi-VN')}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="py-20 text-center text-gray-400 text-xs italic">
                    Không tìm thấy kết quả cho {REGIONS.find(r => r.key === region)?.label}.
                </div>
            )}
        </div>
    );
}
