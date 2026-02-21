'use client';

import { NewsItem, formatDate } from '@/lib/api';
import {
    Card,
    Text,
    Title,
    Flex,
    Icon,
    Badge,
    Divider,
} from '@tremor/react';
import { RiNewspaperLine, RiTimeLine, RiArrowRightUpLine, RiExternalLinkLine } from '@remixicon/react';
import Link from 'next/link';

interface NewsSectionProps {
    news: NewsItem[];
    isLoading?: boolean;
    error?: string | null;
}

const LOGO_BASE_URL = '/logos/';

export default function NewsSection({ news, isLoading, error }: NewsSectionProps) {
    if (isLoading) {
        return (
            <Card className="p-6">
                <Title className="text-tremor-content-strong dark:text-dark-tremor-content-strong font-bold flex items-center">
                    <Icon icon={RiNewspaperLine} className="mr-2 text-blue-500" size="sm" />
                    Market News
                </Title>
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-tremor-brand" />
                    <Text>Loading latest news...</Text>
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
                    <Text className="text-rose-500 font-medium">⚠️ {error}</Text>
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

                    // Sentiment formatting
                    let sentiment = 'Trung lập';
                    let sentimentColor = 'text-yellow-600 dark:text-yellow-500';
                    let hasSentiment = false;
                    if (item.sentiment === 'Positive' || item.Sentiment === 'Positive') {
                        sentiment = 'Tích cực';
                        sentimentColor = 'text-emerald-600 dark:text-emerald-500';
                        hasSentiment = true;
                    } else if (item.sentiment === 'Negative' || item.Sentiment === 'Negative') {
                        sentiment = 'Tiêu cực';
                        sentimentColor = 'text-rose-600 dark:text-rose-500';
                        hasSentiment = true;
                    }

                    // Audio duration
                    const audioDur = item.female_audio_duration || item.male_audio_duration || 0;
                    const mins = Math.floor(audioDur / 60);
                    const secs = Math.floor(audioDur % 60);
                    const durString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                    return (
                        <div key={index}
                            className="flex flex-col rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] overflow-hidden hover:ring-1 hover:ring-tremor-brand transition-all cursor-pointer shadow-sm hover:shadow-md"
                            onClick={() => window.open(finalUrl, '_blank')}
                        >
                            {/* Image Header */}
                            <div className="h-44 w-full bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle relative overflow-hidden group">
                                {image ? (
                                    <img
                                        src={image}
                                        alt={title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-tremor-content-subtle dark:text-dark-tremor-content-subtle bg-slate-100 dark:bg-slate-800">
                                        <svg className="w-10 h-10 opacity-30" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 3h-15C3.12 3 2 4.12 2 5.5v13C2 19.88 3.12 21 4.5 21h15c1.38 0 2.5-1.12 2.5-2.5v-13C22 4.12 20.88 3 19.5 3zM19.5 19h-15V5.5h15V19zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="p-4 flex flex-col flex-1">
                                {/* Meta data row */}
                                <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                                    {hasSentiment && <span className={sentimentColor}>{sentiment}</span>}
                                    {hasSentiment && <span className="text-gray-400 dark:text-gray-600">•</span>}
                                    {symbol && <span className="text-tremor-content-strong dark:text-dark-tremor-content-strong font-bold">{symbol}</span>}
                                </div>

                                {/* Title */}
                                <h3 className="text-[15px] font-bold text-tremor-content-strong dark:text-dark-tremor-content-strong leading-normal line-clamp-2 md:line-clamp-3 mb-auto">
                                    {title}
                                </h3>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[12px] text-tremor-content-subtle dark:text-dark-tremor-content-subtle mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                        <span>{timeFormat}</span>
                                        <span>•</span>
                                        <span className="truncate">{source}</span>
                                    </div>

                                    <div className="flex items-center gap-2.5 shrink-0 ml-2 font-medium">
                                        {audioDur > 0 && (
                                            <div className="flex items-center gap-1 opacity-80">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                    <rect x="2" y="9" width="4" height="6" rx="1" />
                                                    <rect x="10" y="4" width="4" height="16" rx="1" />
                                                    <rect x="18" y="9" width="4" height="6" rx="1" />
                                                </svg>
                                                <span>{durString}</span>
                                            </div>
                                        )}
                                        <div className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 flex items-center justify-center transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/20">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2Z" />
                                                <path d="M15 12 10 8v8l5-4Z" />
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
