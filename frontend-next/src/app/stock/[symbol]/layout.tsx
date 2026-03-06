import type { Metadata } from 'next';

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  return {
    title: sym,
    description: `Analysis and valuation of ${sym} — price history, financial statements, DCF valuation and sector comparison.`,
    alternates: { canonical: `/stock/${sym}` },
    openGraph: {
      title: `${sym} | Stock Analysis — Quang Anh`,
      description: `Analysis and valuation of ${sym} — price history, financials, DCF valuation.`,
      url: `/stock/${sym}`,
    },
  };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
