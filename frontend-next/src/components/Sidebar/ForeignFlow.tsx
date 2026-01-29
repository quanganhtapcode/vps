'use client';

import {
    Card,
    List,
    ListItem,
    Text,
    Title,
    TabGroup,
    TabList,
    Tab,
    Flex,
} from '@tremor/react';
import { RiShoppingBag3Line, RiBuilding2Line } from '@remixicon/react';
import Link from 'next/link';
import { TopMoverItem } from '@/lib/api';
import { siteConfig } from '@/app/siteConfig';

interface ForeignFlowProps {
    buys: TopMoverItem[];
    sells: TopMoverItem[];
    activeTab: 'buy' | 'sell';
    onTabChange: (tab: 'buy' | 'sell') => void;
    isLoading?: boolean;
    maxItems?: number;
}

const LOGO_BASE_URL = '/logos/';

export default function ForeignFlow({
    buys,
    sells,
    activeTab,
    onTabChange,
    isLoading,
    maxItems = 5,
}: ForeignFlowProps) {
    const items = activeTab === 'buy' ? buys : sells;

    return (
        <Card className="mt-6 p-0 overflow-hidden border-tremor-border dark:border-dark-tremor-border shadow-sm">
            {/* Header with Tabs */}
            <div className="bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle px-4 py-3 border-b border-tremor-border dark:border-dark-tremor-border">
                <Flex alignItems="center" justifyContent="between" className="mb-2">
                    <div className="flex items-center gap-2">
                        <RiShoppingBag3Line className="w-4 h-4 text-indigo-500" />
                        <Title className="text-sm font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                            Foreign Flow
                        </Title>
                    </div>
                </Flex>

                <TabGroup
                    index={activeTab === 'buy' ? 0 : 1}
                    onIndexChange={(index) => onTabChange(index === 0 ? 'buy' : 'sell')}
                >
                    <TabList variant="line">
                        <Tab className="text-[10px] font-bold uppercase tracking-wider py-1.5">Net Buy</Tab>
                        <Tab className="text-[10px] font-bold uppercase tracking-wider py-1.5">Net Sell</Tab>
                    </TabList>
                </TabGroup>
            </div>

            <div className="px-4 pb-4 pt-1">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
                        <Text className="text-xs font-medium text-tremor-content-subtle">Loading...</Text>
                    </div>
                ) : items.length > 0 ? (
                    <List className="mt-1">
                        {items.slice(0, maxItems).map((item) => {
                            const value = item.Value || 0;
                            const valueInBillion = Math.abs(value) / 1000000000;
                            const isPositive = activeTab === 'buy';

                            return (
                                <ListItem key={item.Symbol} className="group border-b border-tremor-border/5 dark:border-dark-tremor-border/5 last:border-0 hover:bg-tremor-background-muted/40 transition-colors px-1 -mx-1">
                                    <Link href={`/stock/${item.Symbol}`} className="flex items-center w-full py-2">
                                        {/* Ticker Logo */}
                                        <div className="relative shrink-0 h-8 w-8 flex items-center justify-center bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-tremor-border/10 dark:border-dark-tremor-border/10 group-hover:border-indigo-500/30 transition-colors">
                                            <img
                                                src={siteConfig.stockLogoUrl(item.Symbol)}
                                                alt={item.Symbol}
                                                className="h-full w-full object-contain p-1.5"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    if (!target.src.includes('/logos/')) {
                                                        target.src = `/logos/${item.Symbol}.jpg`;
                                                    } else {
                                                        target.style.display = 'none';
                                                        target.nextElementSibling?.classList.remove('hidden');
                                                    }
                                                }}
                                            />
                                            <div className="fallback-icon hidden text-tremor-content-strong dark:text-dark-tremor-content-strong font-bold text-[10px]">
                                                {item.Symbol[0]}
                                            </div>
                                        </div>

                                        <div className="ml-3 flex-grow min-w-0">
                                            <div className="flex items-center justify-between">
                                                <Text className="font-bold text-xs text-tremor-content-strong dark:text-dark-tremor-content-strong group-hover:text-indigo-500 transition-colors">
                                                    {item.Symbol}
                                                </Text>
                                                <Text className="text-xs font-bold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                                                    {item.CurrentPrice ? item.CurrentPrice.toLocaleString('vi-VN') : '-'}
                                                </Text>
                                            </div>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <div className="flex items-center text-tremor-content-subtle dark:text-dark-tremor-content-subtle text-[10px] font-medium truncate max-w-[100px]">
                                                    <RiBuilding2Line className="w-2.5 h-2.5 mr-1 shrink-0 opacity-60" />
                                                    <span className="truncate">{item.CompanyName || 'No Name'}</span>
                                                </div>
                                                {isPositive ? (
                                                    <span className="inline-flex items-center rounded-tremor-small bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-500">
                                                        {valueInBillion.toFixed(1)}B
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-tremor-small bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-400/20 dark:text-red-500">
                                                        {valueInBillion.toFixed(1)}B
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                </ListItem>
                            );
                        })}
                    </List>
                ) : (
                    <div className="py-8 text-center">
                        <Text className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle text-xs">
                            No foreign flow data available.
                        </Text>
                    </div>
                )}
            </div>
        </Card>
    );
}
