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
                        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
                            <div className="grid grid-cols-[80px_1fr] divide-x divide-y divide-gray-200 dark:divide-gray-700">
                                {northernPrizes.map((key) => {
                                    const prizes = data.results![key as keyof typeof data.results];
                                    if (!prizes || key === 'provinces') return null;
                                    const isDB = key === 'DB';
                                    const prizeArray = (Array.isArray(prizes) ? prizes : [prizes]) as string[];

                                    return (
                                        <React.Fragment key={key}>
                                            <div className="flex items-center justify-center bg-gray-50/50 dark:bg-gray-800/30 p-2.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                                {prizeLabels[key]}
                                            </div>
                                            <div className={`p-2.5 text-center flex flex-wrap justify-center gap-x-4 gap-y-2 font-bold ${isDB ? 'text-lg text-rose-500' : 'text-sm text-gray-700 dark:text-gray-200'
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

                    {/* For Central & Southern (MT/MN) - TABLE LAYOUT */}
                    {(region === 'mn' || region === 'mt') && data.results?.provinces && (
                        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-center border-collapse divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                            <th className="px-3 py-2.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 w-16">Giải</th>
                                            {data.results.provinces.map((prov: any, pIdx: number) => (
                                                <th key={pIdx} className="px-3 py-2.5 text-[11px] font-bold text-gray-700 dark:text-gray-200 min-w-[100px]">
                                                    {prov.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {['G8', 'G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'DB'].map((key) => {
                                            const label = prizeLabels[key] || key;
                                            const isDB = key === 'DB';
                                            return (
                                                <tr key={key} className="divide-x divide-gray-200 dark:divide-gray-700">
                                                    <td className="px-2 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-gray-50/30 dark:bg-gray-800/10">
                                                        {label}
                                                    </td>
                                                    {data.results!.provinces!.map((prov: any, pIdx: number) => {
                                                        const prizes = prov.prizes[key] as string[];
                                                        return (
                                                            <td key={pIdx} className={`px-2 py-3 font-bold ${isDB ? 'text-lg text-rose-500' : 'text-sm text-gray-700 dark:text-gray-200'}`}>
                                                                <div className="flex flex-col gap-1">
                                                                    {prizes?.map((p: string, idx: number) => (
                                                                        <div key={idx}>{p}</div>
                                                                    )) || '-'}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Date Footer */}
                    <div className="text-center py-2">
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
