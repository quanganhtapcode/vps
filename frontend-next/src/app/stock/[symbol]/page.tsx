import { Metadata } from 'next';
import StockDetailClient from './StockDetailClient';
import { getTickerData } from '@/lib/tickerCache';

type Props = {
    params: Promise<{ symbol: string }>;
};

// Generate metadata dynamically
export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    const symbol = params.symbol.toUpperCase();

    // Quick resolve company name using cached list instead of hitting expensive API
    let companyName = symbol;
    try {
        const tickerData = await getTickerData();
        if (tickerData && tickerData.tickers) {
            const ticker = tickerData.tickers.find(
                (t: { symbol: string }) => t.symbol.toUpperCase() === symbol
            );
            if (ticker && ticker.name) {
                companyName = ticker.name;
            }
        }
    } catch (e) {
        // Fallback to minimal
    }

    const title = `${symbol} - ${companyName} | Quang Anh Stock Valuation`;
    const description = `Theo dõi giá trị, chỉ số tài chính, định giá, cổ tức và tin tức mới nhất của công ty ${companyName} (${symbol}).`;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            images: [
                {
                    url: `/api/og?symbol=${symbol}`,
                    width: 1200,
                    height: 630,
                    alt: `${symbol} - ${companyName}`,
                }
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
    };
}

export default async function StockDetailServerPage(props: Props) {
    const params = await props.params;
    const symbol = params.symbol.toUpperCase();

    // The client component fetches remaining data
    return <StockDetailClient />;
}
