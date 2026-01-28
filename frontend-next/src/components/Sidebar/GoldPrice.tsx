'use client';

import {
    Card,
} from '@tremor/react';
import { RiCopperCoinLine, RiWaterFlashLine, RiTimeLine } from '@remixicon/react';
import { GoldPriceItem } from '@/lib/api';
import { useEffect, useState } from 'react';

interface GoldPriceProps {
    prices: GoldPriceItem[];
    isLoading?: boolean;
    updatedAt?: string;
}

export default function GoldPrice({ prices, isLoading, updatedAt }: GoldPriceProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Selection criteria: 3 Gold types + Silver
    const goldTypes = ['Vàng SJC (Miếng)', 'Nhẫn Vàng 9999', 'Vàng VRTL (Miếng)'];

    const displayPrices = prices?.filter(p =>
        goldTypes.includes(p.TypeName) || p.TypeName === 'Bạc 1kg'
    ).map(p => ({
        ...p,
        DisplayName: p.TypeName
            .replace('Vàng SJC (Miếng)', 'SJC Gold')
            .replace('Nhẫn Vàng 9999', '9999 Ring')
            .replace('Vàng VRTL (Miếng)', 'VRTL Gold')
            .replace('Bạc 1kg', 'Silver 1kg'),
        isSilver: p.TypeName === 'Bạc 1kg'
    })) || [];

    // Ensure they appear in a consistent order
    displayPrices.sort((a, b) => {
        if (a.isSilver && !b.isSilver) return 1;
        if (!a.isSilver && b.isSilver) return -1;
        return 0;
    });

    const displayTime = updatedAt ? updatedAt.split(' ')[0] : null;

    return (
        <Card className="mt-4 p-0 overflow-hidden bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 dark:border-gray-800/50">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <RiCopperCoinLine className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                            Precious Metals
                        </span>
                    </div>
                </div>
                {isMounted && updatedAt && (
                    <div className="text-right">
                        <span className="text-[10px] font-medium text-gray-400 tabular-nums leading-none">
                            {updatedAt}
                        </span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-0">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                                    <th className="pl-5 pr-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Asset</th>
                                    <th className="px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Buy</th>
                                    <th className="pl-3 pr-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Sell</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                {displayPrices.map((item) => (
                                    <tr key={item.Id} className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                        <td className="pl-5 pr-3 py-3.5">
                                            <div className="flex items-center gap-2">
                                                {item.isSilver ? (
                                                    <RiWaterFlashLine className="w-3.5 h-3.5 text-slate-400" />
                                                ) : (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                )}
                                                <span className={`text-xs font-bold ${item.isSilver ? 'text-slate-500 dark:text-slate-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                                    {item.DisplayName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3.5 text-right">
                                            <span className={`text-xs font-bold tabular-nums ${item.isSilver ? 'text-slate-600 dark:text-slate-300' : 'text-amber-600 dark:text-amber-500'}`}>
                                                {item.Buy}
                                            </span>
                                        </td>
                                        <td className="pl-3 pr-5 py-3.5 text-right">
                                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                                {item.Sell}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Footer decoration */}
            <div className="h-1 w-full bg-gradient-to-r from-amber-200/20 via-slate-200/20 to-amber-200/20 dark:from-amber-900/10 dark:via-slate-800/10 dark:to-amber-900/10" />
        </Card>
    );
}
