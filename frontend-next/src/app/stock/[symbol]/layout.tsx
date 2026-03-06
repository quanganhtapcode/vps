import type { Metadata } from 'next';

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  return {
    title: sym,
    description: `Phân tích và định giá cổ phiếu ${sym} — lịch sử giá, báo cáo tài chính, định giá DCF và so sánh ngành.`,
    alternates: { canonical: `/stock/${sym}` },
    openGraph: {
      title: `${sym} | Phân tích cổ phiếu Quang Anh`,
      description: `Phân tích và định giá cổ phiếu ${sym} — lịch sử giá, tài chính, định giá DCF.`,
      url: `/stock/${sym}`,
    },
  };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
