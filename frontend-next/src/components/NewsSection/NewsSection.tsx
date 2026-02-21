'use client';

import { useEffect, useState } from 'react';
import { NewsItem, formatDate, formatNumber } from '@/lib/api';
import {
    Card,
    Title,
    Flex,
    Icon,
} from '@tremor/react';
import { RiNewspaperLine, RiArrowRightUpLine } from '@remixicon/react';
import Link from 'next/link';

interface NewsSectionProps {
    news: NewsItem[];
    isLoading?: boolean;
    error?: string | null;
}

interface SymbolPrice {
    price: number;
    change: number;
    changePercent: number;
}

export default function NewsSection({ news, isLoading, error }: NewsSectionProps) {
    const [prices, setPrices] = useState<Record<string, SymbolPrice>>({});

    // Fetch prices for ALL news symbols in 1 single request using bulk endpoint
    useEffect(() => {
        if (!news || news.length === 0) return;

        const uniqueSymbols = [...new Set(
            news.map(item => item.Symbol || item.symbol || '').filter(Boolean)
        )];

        if (uniqueSymbols.length === 0) return;

        // ONE request with ?symbols=FMC,SSI,VNM,... instead of N separate requests
        fetch(`/api/market/prices?symbols=${uniqueSymbols.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then((data: Record<string, SymbolPrice>) => {
                setPrices(data);
            })
            .catch(() => { /* silently fail - prices are optional */ });
    }, [news]);

    if (isLoading) {
        return (
            <Card className="p-6">
                <Title className="text-tremor-content-strong dark:text-dark-tremor-content-strong font-bold flex items-center">
                    <Icon icon={RiNewspaperLine} className="mr-2 text-blue-500" size="sm" />
                    Market News
                </Title>
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-tremor-brand" />
                    <p className="text-tremor-content dark:text-dark-tremor-content text-sm">Loading latest news...</p>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6">
                <Title className="text-tremor-content-strong dark:text-dark-tremor-content-strong font-bold flex items-center">
                    <Icon icon={RiNewspaperLine} className="mr-2 text-blue-500" size="sm" />
                    Market News
                </Title>
                <div className="py-12 text-center text-rose-500">
                    <p className="text-rose-500 font-medium text-sm">⚠️ {error}</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-3 md:p-6 mt-4 md:mt-6">
            <Flex alignItems="center" justifyContent="between">
                <Title className="text-sm md:text-tremor-content-strong dark:text-dark-tremor-content-strong font-semibold flex items-center">
                    <Icon icon={RiNewspaperLine} className="mr-1.5 md:mr-2 text-blue-500" size="sm" />
                    Market News
                </Title>
                {news.length > 8 && (
                    <Link href="/news" className="text-xs font-medium text-tremor-brand hover:underline flex items-center">
                        View More<span className="hidden sm:inline">&nbsp;News</span> <Icon icon={RiArrowRightUpLine} size="xs" className="ml-0.5 md:ml-1" />
                    </Link>
                )}
            </Flex>

            <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {news.slice(0, 12).map((item, index) => {
                    const url = item.url || item.Link || item.NewsUrl || '#';
                    const finalUrl = url.startsWith('http') ? url : `https://cafef.vn${url}`;
                    const title = item.title || item.Title || '';
                    const source = item.source || item.Source || 'Tổng hợp';
                    const pubDateStr = item.publish_date || item.PostDate || item.PublishDate;
                    const timeFormat = pubDateStr ? formatDate(pubDateStr) : '';
                    const image = item.image_url || item.ImageThumb || item.Avatar || '';
                    const symbol = item.Symbol || item.symbol || '';
                    const priceInfo = symbol ? prices[symbol] : undefined;

                    // Sentiment formatting
                    let sentiment = '';
                    let sentimentColor = 'text-yellow-600 dark:text-yellow-500';
                    const rawSentiment = item.sentiment || item.Sentiment || '';
                    if (rawSentiment === 'Positive') {
                        sentiment = 'Tích cực';
                        sentimentColor = 'text-emerald-600 dark:text-emerald-500';
                    } else if (rawSentiment === 'Negative') {
                        sentiment = 'Tiêu cực';
                        sentimentColor = 'text-rose-600 dark:text-rose-500';
                    } else if (rawSentiment === 'Neutral') {
                        sentiment = 'Trung lập';
                        sentimentColor = 'text-yellow-600 dark:text-yellow-500';
                    }

                    // Audio duration
                    const audioDur = item.female_audio_duration || item.male_audio_duration || 0;
                    const mins = Math.floor(audioDur / 60);
                    const secs = Math.floor(audioDur % 60);
                    const durString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                    // Price color
                    const priceUp = priceInfo && priceInfo.change > 0;
                    const priceDown = priceInfo && priceInfo.change < 0;
                    const priceColor = priceUp
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : priceDown
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-yellow-600 dark:text-yellow-400';
                    const priceBg = priceUp
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : priceDown
                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400';

                    return (
                        <div
                            key={index}
                            className="flex flex-col rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] overflow-hidden hover:ring-1 hover:ring-tremor-brand transition-all cursor-pointer shadow-sm hover:shadow-md"
                            onClick={() => window.open(finalUrl, '_blank')}
                        >
                            {/* Image Header */}
                            <div className="h-44 w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden group">
                                {image ? (
                                    <img
                                        src={image}
                                        alt={title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <svg className="w-10 h-10 opacity-20 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M19.5 3h-15C3.12 3 2 4.12 2 5.5v13C2 19.88 3.12 21 4.5 21h15c1.38 0 2.5-1.12 2.5-2.5v-13C22 4.12 20.88 3 19.5 3zM19.5 19h-15V5.5h15V19zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                        </svg>
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-4 flex flex-col flex-1">
                                {/* Meta: Sentiment + Symbol + Price */}
                                <div className="flex items-center gap-1.5 text-xs font-semibold mb-2 flex-wrap">
                                    {sentiment && (
                                        <span className={sentimentColor}>{sentiment}</span>
                                    )}
                                    {sentiment && symbol && (
                                        <span className="text-gray-400 dark:text-gray-600">•</span>
                                    )}
                                    {symbol && (
                                        <span className={`font-bold ${priceColor}`}>{symbol}</span>
                                    )}
                                    {priceInfo && (
                                        <div className="flex items-center gap-1 ml-0.5">
                                            <span className={priceColor}>
                                                {formatNumber(priceInfo.price, { maximumFractionDigits: 0 })}
                                            </span>
                                            <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${priceBg}`}>
                                                {priceInfo.change > 0 ? '+' : ''}{priceInfo.change === 0 ? '0' : formatNumber(priceInfo.change, { maximumFractionDigits: 0 })}
                                                ({priceInfo.changePercent === 0 ? '0%' : (priceInfo.changePercent > 0 ? '+' : '') + priceInfo.changePercent.toFixed(1) + '%'})
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <h3 className="text-[15px] font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong leading-snug line-clamp-3 mb-auto">
                                    {title}
                                </h3>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[12px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        {timeFormat && <span className="shrink-0">{timeFormat}</span>}
                                        {timeFormat && source && <span>•</span>}
                                        <span className="truncate">{source}</span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        {audioDur > 0 && (
                                            <div className="flex items-center gap-1 opacity-70">
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                                    <rect x="2" y="9" width="4" height="6" rx="1" />
                                                    <rect x="10" y="4" width="4" height="16" rx="1" />
                                                    <rect x="18" y="9" width="4" height="6" rx="1" />
                                                </svg>
                                                <span className="font-medium">{durString}</span>
                                            </div>
                                        )}
                                        <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
