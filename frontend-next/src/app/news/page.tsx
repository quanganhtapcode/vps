'use client';

import { useState, useEffect } from 'react';
import { NewsItem, formatDate } from '@/lib/api';
import styles from './page.module.css';
import { siteConfig } from '@/app/siteConfig';

const LOGO_BASE_URL = '/logos/';

export default function NewsPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadNews() {
            try {
                setIsLoading(true);
                const response = await fetch('/api/market/news?page=1&size=50');
                if (!response.ok) throw new Error('Failed to fetch news');
                const data = await response.json();
                // Handle API response with Data property
                const newsArray = Array.isArray(data) ? data : (data.Data || data.data || data.news || []);
                setNews(newsArray);
            } catch (err) {
                console.error('Error loading news:', err);
                setError('Failed to load news');
            } finally {
                setIsLoading(false);
            }
        }
        loadNews();
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>📰 Market News</h1>
                <p className={styles.subtitle}>Latest updates from the Vietnam stock market</p>
            </div>

            {isLoading && (
                <div className={styles.loading}>
                    <div className="spinner" />
                    <span>Loading news...</span>
                </div>
            )}

            {error && (
                <div className={styles.error}>
                    <span>⚠️ {error}</span>
                </div>
            )}

            {!isLoading && !error && (
                <div className={styles.newsList}>
                    {news.map((item, index) => {
                        const title = item.Title || '';
                        const link = item.Link || item.NewsUrl || '#';
                        const url = link.startsWith('http') ? link : `https://cafef.vn${link}`;
                        const img = item.ImageThumb || item.Avatar || '';
                        const time = formatDate(item.PostDate || item.PublishDate);
                        const symbol = item.Symbol || '';
                        const change = item.ChangePrice || 0;
                        const isUp = change >= 0;

                        return (
                            <a
                                key={index}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.newsItem}
                            >
                                {/* Thumbnail */}
                                {img && (
                                    <div className={styles.thumbnail}>
                                        <img
                                            src={img}
                                            alt={title}
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Content */}
                                <div className={styles.content}>
                                    <h3 className={styles.newsTitle}>{title}</h3>

                                    <div className={styles.meta}>
                                        {time && <span className={styles.time}>{time}</span>}

                                        {symbol && (
                                            <span
                                                className={`${styles.stockTag} ${isUp ? styles.positive : styles.negative}`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    window.location.href = `/stock/${symbol}`;
                                                }}
                                            >
                                                <img
                                                    src={siteConfig.stockLogoUrl(symbol)}
                                                    alt={symbol}
                                                    className={styles.stockLogo}
                                                    style={{ objectFit: 'contain', backgroundColor: '#fff', padding: '1px' }}
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        if (!target.src.includes('/logos/')) {
                                                            target.src = `/logos/${symbol}.jpg`;
                                                        } else {
                                                            target.style.display = 'none';
                                                        }
                                                    }}
                                                />
                                                {symbol}
                                                {item.Price && ` ${item.Price}`}
                                                {change !== 0 && ` ${isUp ? '+' : ''}${change}`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </a>
                        );
                    })}
                </div>
            )}

            {!isLoading && news.length === 0 && !error && (
                <div className={styles.empty}>
                    <span>No news found</span>
                </div>
            )}
        </div>
    );
}
