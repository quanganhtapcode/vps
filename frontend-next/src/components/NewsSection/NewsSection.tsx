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
                {news.length > 6 && (
                    <Link href="/news" className="text-xs font-medium text-tremor-brand hover:underline flex items-center">
                        View More<span className="hidden sm:inline">&nbsp;News</span> <Icon icon={RiArrowRightUpLine} size="xs" className="ml-0.5 md:ml-1" />
                    </Link>
                )}
            </Flex>

            <div className="mt-4 md:mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {news.slice(0, 6).map((item, index) => {
                    const title = item.Title || '';
                    const link = item.Link || item.NewsUrl || '#';
                    const url = link.startsWith('http') ? link : `https://cafef.vn${link}`;
                    const img = item.ImageThumb || item.Avatar || '';
                    const time = formatDate(item.PostDate || item.PublishDate);
                    const symbol = item.Symbol || '';
                    const isUp = (item.ChangePrice || 0) >= 0;

                    return (
                        <div key={index} className="group flex flex-row gap-3 md:gap-4 p-2 -m-2 hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted rounded-xl transition-all h-full">
                            {/* Thumbnail */}
                            {img && (
                                <div className="relative shrink-0 w-24 md:w-32 h-20 md:h-24 rounded-lg overflow-hidden bg-tremor-background-subtle dark:bg-dark-tremor-background-subtle border border-tremor-border dark:border-dark-tremor-border">
                                    <img
                                        src={img}
                                        alt=""
                                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                        loading="lazy"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                        }}
                                    />
                                    <div className="absolute top-1 right-1 bg-black/40 backdrop-blur-sm p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        <RiExternalLinkLine className="w-2.5 h-2.5 text-white" />
                                    </div>
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex flex-col h-full grow min-w-0">
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="grow"
                                >
                                    <Text className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong leading-tight group-hover:text-tremor-brand transition-colors line-clamp-2 text-xs md:text-sm">
                                        {title}
                                    </Text>
                                </a>

                                <div className="mt-1.5 md:mt-auto pt-1 flex items-center justify-between">
                                    <div className="flex items-center text-tremor-content-subtle text-xs">
                                        <Icon icon={RiTimeLine} size="xs" className="mr-0.5 md:mr-1 scale-75 md:scale-100" />
                                        {time}
                                    </div>

                                    {symbol && (
                                        <Badge
                                            className="cursor-pointer hover:ring-1 hover:ring-tremor-brand transition-all py-0.5 px-2 text-xs"
                                            color={isUp ? 'emerald' : 'rose'}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                window.location.href = `/stock/${symbol}`;
                                            }}
                                        >
                                            <div className="flex items-center gap-1 font-medium">
                                                {symbol}
                                            </div>
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
